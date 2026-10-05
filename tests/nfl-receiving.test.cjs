/* eslint-disable @typescript-eslint/no-require-imports -- Match the existing dependency-free test runner. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');
for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => {
    const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true }, fileName: filename,
    });
    module._compile(outputText, filename);
  };
}
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { NFLReceivingCard } = require('../src/app/ui/nfl-receiving-card.tsx');
const { parseReceivingFeed, numberLabel, loadReceivingFeed, marketIsCurrent, selectPastProp, displayBookSide, quoteAge } = require('../src/lib/nfl-receiving.ts');
const example = require('../src/lib/nfl-receiving-example.json');
const card = example.signals.find(s => s.prop === 'receiving_yards');
const now = Date.parse(example.generated_at);
const render = (change = {}, options = {}) => renderToStaticMarkup(React.createElement(NFLReceivingCard, { card: { ...card, ...change }, now, sample: true, ...options }));

test('sample preview is explicitly labeled and live is the default', () => {
  const { NFLReceivingDashboard } = require('../src/app/ui/nfl-receiving-dashboard.tsx');
  const html = renderToStaticMarkup(React.createElement(NFLReceivingDashboard));
  assert.ok(html.includes('Sample preview'));
  assert.ok(html.includes('Next 72 hours'));
  assert.ok(!html.includes('Example Receiver'));
});
test('extra sportsbook rows never appear in a card', () => {
  const html = render({ market: { ...card.market, books: [...card.market.books, { id: 'caesars', name: 'Caesars', line: 999 }] } });
  assert.ok(!html.includes('Caesars'));
  assert.ok(!html.includes('999'));
});
test('loader rejects failures and malformed data and forwards cancellation', async () => {
  const original = global.fetch;
  const controller = new AbortController();
  try {
    global.fetch = async (url, options) => {
      assert.equal(url, '/api/odds/nfl/receiving/?limit=100');
      assert.equal(options.signal, controller.signal);
      assert.equal(options.cache, 'no-store');
      return Response.json(example);
    };
    assert.equal((await loadReceivingFeed(controller.signal)).signals.length, 2);
    global.fetch = async () => Response.json({}, { status: 503 });
    await assert.rejects(loadReceivingFeed(), /unavailable/);
    global.fetch = async () => Response.json({ window_hours: 48, games: [], signals: [] });
    await assert.rejects(loadReceivingFeed(), /unexpected response/);
  } finally { global.fetch = original; }
});
test('proxy is no-store, does not forward arbitrary URLs, and distinguishes upstream failures', async () => {
  const { GET } = require('../src/app/api/odds/nfl/receiving/route.ts');
  const original = global.fetch;
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  process.env.NEXT_PUBLIC_API_BASE_URL = 'https://backend.example';
  try {
    global.fetch = async (url, options) => {
      assert.equal(url, 'https://backend.example/api/odds/nfl/receiving/');
      assert.equal(options.cache, 'no-store');
      return Response.json(example);
    };
    const response = await GET(new Request('http://localhost/api/odds/nfl/receiving/?url=ignored'));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    global.fetch = async () => Response.json({}, { status: 503 });
    assert.equal((await GET(new Request('http://localhost/api/odds/nfl/receiving/'))).status, 503);
  } finally { global.fetch = original; if (base === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL; else process.env.NEXT_PUBLIC_API_BASE_URL = base; }
});

test('traverses more than 300 cards, deduplicates and restarts an expired cursor', async () => {
  const original = global.fetch;
  let calls = 0;
  const cursor = 'opaque +/?=&';
  try {
    global.fetch = async url => {
      calls++;
      const params = new URL(url, 'http://localhost').searchParams;
      if (calls === 2) return Response.json({}, { status: 400 });
      if (!params.has('cursor')) return Response.json({ ...example, next_cursor: cursor, truncated: true,
        signals: Array.from({ length: 300 }, (_, i) => ({ ...card, id: String(i) })) });
      assert.equal(params.get('cursor'), cursor);
      return Response.json({ ...example, next_cursor: null, signals: [{ ...card, id: '299' }, { ...card, id: '300' }] });
    };
    const feed = await loadReceivingFeed();
    assert.equal(calls, 4);
    assert.equal(feed.signals.length, 301);
    assert.equal(feed.projection_count, 301);
  } finally { global.fetch = original; }
});
const signal = { direction: 'UNDER', status: 'eligible', projection: '62.75', threshold: '78.5', edge: '-15.75', edge_pct: '-20.1', confidence: 75, threshold_is_offered: false, reasons: [{ code: 'test_reason', text: 'Backend explanation' }] };
const fresh = new Date(now + 60000).toISOString();
const expired = new Date(now - 1000).toISOString();
const prices = { ...card.market, expires_at: fresh, consensus_expires_at: fresh, books: card.market.books.map((book, i) => ({ ...book, expires_at: i === 0 ? expired : fresh, over_expires_at: fresh, under_expires_at: expired, latest_saved: undefined })) };

test('normalizes immutable decimals, retains null and rejects non-finite data', () => {
  const feed = parseReceivingFeed({ ...example, signals: [{ ...card, signal, official_prediction: { signal: { ...signal, edge: null } } }] });
  assert.equal(feed.signals[0].signal.threshold, 78.5);
  assert.equal(feed.signals[0].official_prediction.signal.edge, null);
  assert.throws(() => parseReceivingFeed({ ...example, signals: [{ ...card, signal: { ...signal, edge: 'Infinity' } }] }), /unexpected/);
});
test('proxy encodes supported parameters and preserves cursor errors', async () => {
  const { GET } = require('../src/app/api/odds/nfl/receiving/route.ts');
  const original = global.fetch;
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  process.env.NEXT_PUBLIC_API_BASE_URL = 'https://backend.example';
  try {
    global.fetch = async url => {
      const parsed = new URL(url);
      assert.equal(parsed.searchParams.get('cursor'), 'a+/=');
      assert.equal(parsed.searchParams.get('limit'), '100');
      assert.equal(parsed.searchParams.has('token'), false);
      return Response.json({}, { status: 400 });
    };
    assert.equal((await GET(new Request('http://localhost/api/odds/nfl/receiving/?limit=100&cursor=a%2B%2F%3D&token=ignore'))).status, 400);
  } finally { global.fetch = original; if (base === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL; else process.env.NEXT_PUBLIC_API_BASE_URL = base; }
});

test('cancellation between pages prevents obsolete traversal and partial errors never return a slate', async () => {
  const original = global.fetch;
  try {
    const controller = new AbortController();
    global.fetch = async () => { controller.abort(); return Response.json({ ...example, next_cursor: 'next' }); };
    await assert.rejects(loadReceivingFeed(controller.signal), { name: 'AbortError' });
    let calls = 0;
    global.fetch = async () => ++calls === 1 ? Response.json({ ...example, next_cursor: 'next' }) : Response.json({}, { status: 503 });
    await assert.rejects(loadReceivingFeed(), /unavailable/);
    global.fetch = async () => Response.json({ ...example, next_cursor: null, truncated: true });
    await assert.rejects(loadReceivingFeed(), /incomplete slate/);
  } finally { global.fetch = original; }
});

test('compact sample leads with the signal and first five recent games, without research diagnostics', () => {
  assert.equal(parseReceivingFeed(example).window_hours, 72);
  const html = render({}, { matchup: 'Upcoming matchup' });
  for (const text of ['Upcoming matchup', 'OVER 50.5', 'Recent performances', 'Sep 27, 2026', 'Playoffs · 2025', 'Show all 10 games', 'DraftKings']) assert.ok(html.includes(text), text);
  assert.ok(!html.includes('Example Eagles'));
  for (const text of ['Historical production vs', 'Confidence', 'How this projection', 'PASS · Unavailable', 'Evidence gap', 'Policy lock']) assert.ok(!html.includes(text), text);
});
test('neutral statuses come from display and do not hide useful history', () => {
  for (const [state, label] of [['no_edge', 'No qualifying edge'], ['awaiting_odds', 'No fresh odds available'], ['stale_projection', 'Projection needs an update'], ['insufficient_history', 'More game history needed']]) {
    const html = render({ display: { state, label, show_market_table: false }, signal: { ...signal, direction: 'PASS' }, live_signal: null });
    assert.ok(html.includes(label));
    assert.ok(html.includes('Recent performances'));
    assert.ok(!html.includes('receiving-direction'));
    assert.ok(html.includes('Sportsbook odds'));
  }
});
test('historical selection uses DK, FD, Bovada priority, respects preference and preserves backend results', () => {
  const props = [{ bookmaker: 'bovada', bookmaker_name: 'Bovada', line: 80, result: 'OVER' }, { bookmaker: 'fanduel', bookmaker_name: 'FanDuel', line: 70, result: 'PUSH' }, { bookmaker: 'draftkings', bookmaker_name: 'DraftKings', line: 65, result: 'UNDER' }];
  assert.equal(selectPastProp(props).bookmaker, 'draftkings');
  assert.equal(selectPastProp(props, 'fanduel').bookmaker, 'fanduel');
  assert.equal(selectPastProp(props.slice(0, 2)).bookmaker, 'fanduel');
  const games = ['OVER', 'UNDER', 'PUSH'].map((result, i) => ({ ...card.recent_games.games[i], value: 99, props: [{ ...props[2], result }] }));
  const html = render({ recent_games: { ...card.recent_games, games } });
  for (const result of ['OVER', 'UNDER', 'PUSH']) assert.ok(html.includes(`receiving-result">${result}</span>`));
});
test('missing historical props and null actuals remain unavailable without borrowing current lines', () => {
  const games = [{ ...card.recent_games.games[0], value: 83, props: [] }, { ...card.recent_games.games[1], value: null, props: [{ bookmaker: 'draftkings', bookmaker_name: 'DraftKings', line: 65, result: null }] }];
  const html = render({ recent_games: { ...card.recent_games, games } });
  assert.ok(html.includes('<td>83</td><td>—</td><td><span class="receiving-result">—'));
  assert.ok(html.includes('<td>—</td><td>65<small>DraftKings'));
  assert.equal(numberLabel(null), '—');
  assert.equal(numberLabel(0), '0');
  const parsed = parseReceivingFeed({ ...example, signals: [{ ...card, recent_games: { ...card.recent_games, games: [{ ...games[1], receptions: '4', receiving_yards: null }] } }] });
  assert.equal(parsed.signals[0].recent_games.games[0].receptions, 4);
  assert.equal(parsed.signals[0].recent_games.games[0].value, null);
});
test('older responses omit recent history and display without inventing rows', () => {
  const older = { ...card, recent_games: undefined, display: undefined };
  assert.equal(parseReceivingFeed({ ...example, signals: [older] }).signals.length, 1);
  assert.ok(render(older).includes('Recent performances are not available yet'));
});
test('current prices expire independently and failed refresh retains only history and saved projection', () => {
  const html = render({ market: { ...prices, consensus_expires_at: expired }, signal, live_signal: signal }, { sample: false });
  assert.ok(html.includes('Current comparison awaiting refresh'));
  const priceSection = html.split('receiving-current-prices')[1].split('</section>')[0];
  assert.ok(priceSection.includes('2/3 current lines'));
  assert.ok(priceSection.includes('DraftKings'));
  assert.ok(priceSection.includes('Last saved'));
  assert.ok(priceSection.includes('FanDuel'));
  assert.ok(!priceSection.includes('receiving-direction'));
  assert.match(priceSection, /<td>—<\/td>/);
  const failed = render({}, { sample: false, outdated: true });
  assert.ok(failed.includes('Saved projection'));
  assert.ok(failed.includes('Recent performances'));
  assert.ok(!failed.includes('Current sportsbook prices'));
  assert.equal(marketIsCurrent({ ...card, market: prices }, now), true);
});
test('official prediction stays separate and frozen when live quotes change or fail', () => {
  const official = { id: 1, prediction_id: 1, lock_at: expired, recorded_at: fresh, signal };
  const html = render({ lock_at: expired, official_prediction: official, signal, live_signal: null, projection: { final: 999 }, market: prices }, { sample: false, outdated: true });
  for (const text of ['UNDER 78.5', 'Official · Locked', 'Official projection: 62.75', 'Consensus, not an offered line']) assert.ok(html.includes(text), text);
  assert.ok(html.includes('Saved research projection'));
  assert.ok(!html.includes('Current sportsbook prices'));
  const closed = render({ lock_at: expired, official_prediction: null });
  assert.ok(closed.includes('Prediction window closed'));
  assert.ok(!closed.includes('receiving-direction'));
});

test('signal explanations and visible prices precede history; comparisons use supplied edges', () => {
  const html = render({ edge_vs_median: 123.45 });
  assert.ok(html.indexOf('receiving-direction') < html.indexOf('Current consensus'));
  assert.ok(html.indexOf('Why this signal') < html.indexOf('Sportsbook odds'));
  assert.ok(html.indexOf('Sportsbook odds') < html.indexOf('Recent performances'));
  assert.ok(html.includes('Projection is 12.25 yards above the main-line consensus.'));
  assert.ok(html.includes('Based on 10 recent recorded games.'));
  assert.ok(html.includes('+123.45'));
  assert.ok(html.includes('+22.25'));
  assert.ok(html.includes('<summary>Projection details</summary>'));
});
test('PASS retains available prices and performances without a directional explanation', () => {
  const html = render({ display: { state: 'no_edge', label: 'No qualifying edge' }, signal: { ...signal, direction: 'PASS' }, live_signal: null });
  assert.ok(html.includes('No qualifying edge'));
  assert.ok(html.includes('Sportsbook odds'));
  assert.ok(html.includes('Recent performances'));
  assert.ok(!html.includes('Why this signal'));
});

test('all supported sportsbook rows remain visible when prices are absent or expired', () => {
  const html = render({ market: { ...card.market, books: [], books_available: 0 } }, { sample: false });
  const table = html.split('receiving-current-prices')[1].split('</section>')[0];
  for (const name of ['DraftKings', 'FanDuel', 'Bovada']) assert.ok(table.includes(name));
  assert.equal((table.match(/No line recorded/g) || []).length, 6);
  assert.ok(table.includes('0/3 current lines'));
  assert.ok(!table.includes('-110'));
  const failed = render({}, { sample: false, outdated: true });
  assert.equal((failed.match(/receiving-quote-stale/g) || []).length, 6);
});

const savedQuote = (overrides = {}) => ({ status: 'stale', line: 78.5, american_odds: -115, last_seen_at: new Date(now - 3600000).toISOString(), provider_updated_at: new Date(now - 7200000).toISOString(), expires_at: expired, snapshot_id: 42, stale_reasons: ['provider_update_old'], ...overrides });
const savedBook = (overrides = {}) => ({ id: 'draftkings', name: 'DraftKings', line: null, over_odds: null, under_odds: null, edge: null, last_seen_at: null, latest_saved: { over: savedQuote(), under: savedQuote({ line: 79.5, american_odds: 105 }) }, ...overrides });
test('saved quote decimals normalize and invalid numeric values are rejected', () => {
  const feed = book => parseReceivingFeed({ ...example, signals: [{ ...card, market: { ...card.market, books: [book] } }] });
  const parsed = feed(savedBook({ latest_saved: { over: savedQuote({ line: '78.50', american_odds: '-115' }), under: null } }));
  assert.equal(parsed.signals[0].market.books[0].latest_saved.over.american_odds, -115);
  assert.equal(parsed.signals[0].market.books[0].latest_saved.over.line, 78.5);
  assert.equal(parsed.signals[0].market.books[0].latest_saved.under, null);
  assert.throws(() => feed(savedBook({ latest_saved: { over: savedQuote({ american_odds: 'NaN' }), under: null } })), /unexpected/);
});
test('fresh quote demotes on expiry and request failure without disappearing or retaining a live edge', () => {
  const book = savedBook({ line: 78.5, over_odds: -115, over_expires_at: fresh, expires_at: fresh, edge: -15.75,
    latest_saved: { over: savedQuote({ status: 'fresh', expires_at: fresh }), under: null } });
  assert.equal(displayBookSide(book, 'over', now).status, 'fresh');
  for (const [at, failed] of [[now + 60001, false], [now, true]]) {
    const quote = displayBookSide(book, 'over', at, failed);
    assert.equal(quote.status, 'stale');
    assert.equal(quote.line, 78.5);
    assert.equal(quote.odds, -115);
    const html = render({ lock_at: undefined, market: { ...card.market, books: [book], expires_at: fresh, consensus_expires_at: fresh } }, { now: at, sample: false, outdated: failed });
    assert.ok(html.includes('Last saved'));
    assert.ok(html.includes('-115'));
    const prices = html.split('receiving-current-prices')[1].split('</section>')[0];
    assert.ok(!prices.includes('-15.75'));
    assert.ok(!html.includes('receiving-direction'));
  }
});
test('withdrawals and invalid timestamps clear prices and cannot resurrect older quotes', () => {
  for (const status of ['withdrawn', 'invalid_timestamp']) {
    const book = savedBook({ line: 78.5, over_odds: -115, over_expires_at: fresh, latest_saved: { over: savedQuote({ status, line: null, american_odds: null }), under: null } });
    const side = displayBookSide(book, 'over', now);
    assert.equal(side.status, status);
    assert.equal(side.odds, null);
    const html = render({ market: { ...card.market, books: [book] } });
    assert.ok(html.includes(status === 'withdrawn' ? 'Unavailable' : 'Timing unavailable'));
    assert.ok(!html.includes('-115'));
  }
  assert.equal(displayBookSide(savedBook({ latest_saved: { over: null, under: null } }), 'over', now).status, 'missing');
});
test('mixed fresh and saved sides retain independent thresholds and quote ages', () => {
  const book = savedBook({ line: 78.5, over_odds: -110, over_expires_at: fresh });
  assert.equal(displayBookSide(book, 'over', now).odds, -110); // Prefer fresh DTO.
  const under = displayBookSide(book, 'under', now);
  assert.equal(under.line, 79.5);
  assert.equal(under.status, 'stale');
  assert.equal(quoteAge(under.observedAt, now), '1h ago');
  const html = render({ market: { ...card.market, books: [book] } }, { sample: false });
  assert.ok(html.includes('<strong>78.5</strong>'));
  assert.ok(html.includes('<strong>79.5</strong>'));
  assert.ok(html.includes('+105'));
  assert.ok(html.includes('Last saved · 1h ago'));
  assert.ok(html.includes('Provider update: 2h ago'));
});
test('three saved books never count as fresh coverage or create a signal', () => {
  const books = ['draftkings', 'fanduel', 'bovada'].map(id => savedBook({ id, name: id }));
  const html = render({ market: { ...card.market, books, books_available: 0, books_with_saved_prices: 3, expires_at: null, consensus_expires_at: null } }, { sample: false });
  assert.ok(html.includes('0/3 current lines'));
  assert.ok(html.includes('Last saved'));
  assert.ok(html.includes('-115'));
  assert.ok(!html.includes('receiving-direction'));
});
test('legacy quotes can expire into saved prices without borrowing another side timestamp', () => {
  const book = savedBook({ latest_saved: undefined, line: 10.5, over_odds: -110, under_odds: -120, last_seen_at: expired });
  assert.equal(displayBookSide(book, 'over', now).status, 'stale');
  assert.equal(displayBookSide(book, 'under', now).observedAt, null);
  assert.equal(quoteAge(null, now), 'Age unavailable');
  assert.equal(displayBookSide({ ...book, line: null, over_odds: null }, 'over', now).status, 'missing');
});

const savedComparison = { source: 'latest_saved_main_lines', status: 'stale', median_line: '72.5', projection: '80.25', edge_vs_median: '7.75', books_available: 2, books: [ { ...savedQuote(), bookmaker: 'draftkings' }, { ...savedQuote({ line: 66.5, last_seen_at: new Date(now-1800000).toISOString() }), bookmaker: 'fanduel' } ], oldest_observed_at: new Date(now-3600000).toISOString(), newest_observed_at: new Date(now-1800000).toISOString(), projection_observed_at: example.generated_at, expires_at: expired };
const recordedSignal = { prediction_id: 99, version: 'receiving-production-v1', recorded_at: expired, status: 'historical', is_current: false, signal: { ...signal, threshold: '89.5', projection: '70.25', edge: '-19.25' }, main_lines: { draftkings: '89.5', fanduel: '90.5' }, market_expires_at: fresh, market_is_stale: false };
const savedContext = { market: { ...card.market, saved_comparison: savedComparison, expires_at: expired, consensus_expires_at: expired, books: [savedBook({ saved_edge: '1.75' })] }, last_recorded_signal: recordedSignal };
test('saved consensus and differences persist after expiry with conservative age and original projection', () => {
  for (const at of [now, now+3600000]) {
    const html = render(savedContext, { now: at, sample: false });
    assert.ok(html.includes('Last saved consensus'));
    assert.ok(html.includes('Difference vs saved line'));
    assert.ok(html.includes('72.5'));
    assert.ok(html.includes('80.25'));
    assert.ok(html.includes('+7.75'));
    assert.ok(html.includes(at === now ? 'Saved quotes · 1h ago' : 'Saved quotes · 2h ago'));
    assert.ok(html.includes('Saved diff.'));
    assert.ok(html.includes('+1.75'));
  }
  const failed = render(savedContext, { sample: false, outdated: true });
  assert.ok(failed.includes('Last saved consensus'));
  assert.ok(failed.includes('Historical · Not current or official'));
});
test('fresh comparison and current eligible PASS take precedence over saved and historical data', () => {
  const market = { ...card.market, expires_at: fresh, consensus_expires_at: fresh, saved_comparison: savedComparison };
  for (const direction of ['OVER', 'PASS']) {
    const html = render({ market, signal: { ...signal, direction }, live_signal: null, last_recorded_signal: recordedSignal, display: undefined });
    assert.ok(html.includes('Current consensus'));
    assert.ok(!html.includes('Last saved consensus'));
    assert.ok(!html.includes('Last recorded signal'));
    assert.ok(!html.includes('89.5'));
  }
});
test('recorded signals preserve original values and PASS selection even with unexpired quote timing', () => {
  for (const direction of ['UNDER', 'PASS']) {
    const html = render({ ...savedContext, last_recorded_signal: { ...recordedSignal, signal: { ...recordedSignal.signal, direction } } }, { sample: false });
    assert.ok(html.includes('Last recorded signal'));
    assert.ok(html.includes(`${direction} · Original threshold: 89.5 · Original projection: 70.25`));
    assert.ok(html.includes('Model receiving-production-v1'));
    assert.ok(!html.includes('receiving-direction'));
  }
  assert.ok(!render({ ...savedContext, last_recorded_signal: null }, { sample: false }).includes('Last recorded signal'));
});
test('official and closed cards never use the historical fallback', () => {
  for (const official of [null, { id: 1, prediction_id: 1, lock_at: expired, recorded_at: fresh, signal }]) {
    const html = render({ ...savedContext, lock_at: expired, official_prediction: official }, { sample: false });
    assert.ok(!html.includes('Last recorded signal'));
    assert.ok(html.includes(official ? 'Official · Locked' : 'Prediction window closed'));
  }
});
test('single saved book has its own saved edge without a synthetic consensus; withdrawn quotes have none', () => {
  const html = render({ ...savedContext, market: { ...savedContext.market, saved_comparison: null } }, { sample: false });
  assert.ok(html.includes('+1.75'));
  assert.ok(!html.includes('Last saved consensus'));
  const withdrawn = savedBook({ saved_edge: '123.45', latest_saved: { over: savedQuote({ status: 'withdrawn', line: null, american_odds: null }), under: null } });
  assert.ok(!render({ market: { ...card.market, books: [withdrawn] } }).includes('123.45'));
});
test('new saved and recorded decimals normalize without turning null into zero', () => {
  const parsed = parseReceivingFeed({ ...example, signals: [{ ...card, ...savedContext }] }).signals[0];
  assert.equal(parsed.market.saved_comparison.median_line, 72.5);
  assert.equal(parsed.market.books[0].saved_edge, 1.75);
  assert.equal(parsed.last_recorded_signal.main_lines.draftkings, 89.5);
  assert.equal(parsed.last_recorded_signal.signal.projection, 70.25);
  const empty = parseReceivingFeed({ ...example, signals: [{ ...card, market: { ...card.market, saved_comparison: { ...savedComparison, projection: null, edge_vs_median: null } } }] });
  assert.equal(empty.signals[0].market.saved_comparison.edge_vs_median, null);
});

test('recorded signal leads the card and keeps its evidence separate from latest research', () => {
  const html = render(savedContext, { sample: false });
  assert.ok(html.includes('receiving-recorded-badge'));
  assert.ok(html.indexOf('Last recorded signal') < html.indexOf('Last saved consensus'));
  assert.ok(html.includes('UNDER<!-- --> <!-- -->89.5') || html.includes('UNDER 89.5'));
  assert.ok(html.includes('Original projection: 70.25'));
  assert.ok(html.includes('Evidence at recording time'));
  assert.ok(html.includes('Latest research comparison'));
  assert.ok(html.includes('80.25'));
  assert.ok(html.includes('+10.69<!-- -->% vs line') || html.includes('+10.69% vs line'));
  for (const change of [
    { lock_at: expired },
    { market: { ...card.market, expires_at: fresh, consensus_expires_at: fresh }, live_signal: { ...signal, direction: 'PASS' } },
  ]) assert.ok(!render({ ...savedContext, ...change }, { sample: false }).includes('receiving-recorded-badge'));
});

test('empty past props hide columns while targets and actual results remain visible', () => {
  const recent_games = { ...card.recent_games, games: card.recent_games.games.map(game => ({ ...game, props: [], targets: 12 })) };
  const html = render({ recent_games });
  assert.ok(!html.includes('scope="col">Past prop'));
  assert.ok(!html.includes('scope="col">Result'));
  assert.ok(html.includes('scope="col">Targets'));
  assert.ok(html.includes('No historical sportsbook lines recorded'));
  const mixed = render({ recent_games: { ...recent_games, games: [...recent_games.games.slice(0, 9), card.recent_games.games[0]] } });
  assert.ok(mixed.includes('scope="col">Past prop'));
  assert.ok(!mixed.includes('scope="col">Targets'));
});

test('research evidence preserves window availability and labels cross-season sample correctly', () => {
  const html = render({
    history: { yards: { season: { games_available: 10 }, last_5: { available: false, mean: 999 }, last_3: { available: true, mean: 22 } } },
    opportunity: { trend: { season: 5, last_3: 7 }, windows: { season: { target_share: { available: true, value: '0.25' }, catch_rate: { available: false, value: '0.99' } } } },
    recent_games: { ...card.recent_games, scope: 'last_10_regular_and_postseason' },
  });
  assert.ok(html.includes('Recorded sample · up to 10 games'));
  assert.ok(html.includes('25%'));
  assert.ok(!html.includes('999'));
  assert.ok(!html.includes('99%'));
  assert.ok(html.includes('weighted medians'));
  assert.ok(html.includes('Final projection'));
  assert.ok(!html.includes('Season median'));
});

test('zero or missing comparison thresholds never produce invalid percentages', () => {
  for (const median_line of [0, null]) {
    const html = render({ ...savedContext, market: { ...savedContext.market, saved_comparison: { ...savedComparison, median_line } } }, { sample: false });
    assert.ok(!html.includes('% vs line'));
    assert.ok(!html.includes('Infinity'));
    assert.ok(!html.includes('NaN'));
  }
});
