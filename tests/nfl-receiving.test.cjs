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
const { parseReceivingFeed, numberLabel, loadReceivingFeed, mergeReceivingPage, NFLPageExpiredError, marketIsCurrent, selectPastProp, displayBookSide, quoteAge } = require('../src/lib/nfl-receiving.ts');
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
      assert.equal(url, '/api/odds/nfl/receiving/?limit=20');
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

test('loads one prop page on demand and merges without duplicating cards', async () => {
  const original = global.fetch;
  const calls = [];
  const cursor = 'opaque +/?=&';
  try {
    global.fetch = async url => {
      calls.push(url);
      const params = new URL(url, 'http://localhost').searchParams;
      assert.equal(params.get('limit'), '20');
      assert.equal(params.get('prop'), 'receiving_yards');
      if (!params.has('cursor')) return Response.json({ ...example, total_count: 21, next_cursor: cursor, truncated: true,
        signals: Array.from({ length: 20 }, (_, i) => ({ ...card, id: String(i) })) });
      assert.equal(params.get('cursor'), cursor);
      return Response.json({ ...example, total_count: 21, next_cursor: null, truncated: false,
        signals: [{ ...card, id: '19' }, { ...card, id: '20' }] });
    };
    const first = await loadReceivingFeed(undefined, 'receiving', { prop: 'receiving_yards' });
    assert.equal(calls.length, 1);
    assert.equal(first.signals.length, 20);
    assert.equal(first.next_cursor, cursor);
    const page = await loadReceivingFeed(undefined, 'receiving', { prop: 'receiving_yards', cursor: first.next_cursor });
    const feed = mergeReceivingPage(first, page);
    assert.equal(calls.length, 2);
    assert.equal(feed.signals.length, 21);
    assert.equal(feed.projection_count, 21);
    assert.equal(feed.total_count, 21);
    assert.equal(feed.next_cursor, null);
    assert.equal(feed.games.length, first.games.length);
    global.fetch = async () => Response.json({}, { status: 400 });
    await assert.rejects(loadReceivingFeed(undefined, 'receiving', { cursor }), NFLPageExpiredError);
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
      assert.equal(parsed.searchParams.get('prop'), 'receptions');
      return Response.json({}, { status: 400 });
    };
    assert.equal((await GET(new Request('http://localhost/api/odds/nfl/receiving/?limit=100&cursor=a%2B%2F%3D&prop=receptions&token=ignore'))).status, 400);
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
    const first = await loadReceivingFeed();
    await assert.rejects(loadReceivingFeed(undefined, 'receiving', { cursor: first.next_cursor }), /unavailable/);
    assert.equal(first.next_cursor, 'next');
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

const rushingExample = require('../src/lib/nfl-rushing-example.json');
const rushingCard = rushingExample.signals[0];
test('rushing and receiving parsers reject cross-family slates and normalize carries', () => {
  assert.throws(() => parseReceivingFeed(rushingExample), /unexpected/);
  assert.throws(() => parseReceivingFeed(example, 'rushing'), /unexpected/);
  const input = structuredClone(rushingExample);
  input.signals[0].recent_games.games[0].rushing_yards = '-2';
  input.signals[0].recent_games.games[0].carries = '3';
  const parsed = parseReceivingFeed(input, 'rushing').signals[0];
  assert.equal(parsed.recent_games.games[0].rushing_yards, -2);
  assert.equal(parsed.recent_games.games[0].carries, 3);
  input.signals[0].recent_games.games[0].carries = 'Infinity';
  assert.throws(() => parseReceivingFeed(input, 'rushing'), /unexpected/);
});
test('rushing pagination stays on the rushing endpoint with its own cursor', async () => {
  const original = global.fetch;
  let calls = 0;
  try {
    global.fetch = async (url, options) => {
      const parsed = new URL(url, 'http://localhost');
      assert.equal(parsed.pathname, '/api/odds/nfl/rushing/');
      assert.equal(options.cache, 'no-store');
      if (++calls === 1) return Response.json({ ...rushingExample, next_cursor: 'rushing +/', truncated: true });
      assert.equal(parsed.searchParams.get('cursor'), 'rushing +/');
      return Response.json(rushingExample);
    };
    const first = await loadReceivingFeed(undefined, 'rushing');
    assert.equal(calls, 1);
    assert.equal((await loadReceivingFeed(undefined, 'rushing', { cursor: first.next_cursor })).signals.length, 1);
    assert.equal(calls, 2);
  } finally { global.fetch = original; }
});
test('rushing proxy forwards only supported parameters to the rushing backend', async () => {
  const { GET } = require('../src/app/api/odds/nfl/rushing/route.ts');
  const original = global.fetch;
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  process.env.NEXT_PUBLIC_API_BASE_URL = 'https://backend.example';
  try {
    global.fetch = async (url, options) => {
      assert.equal(url, 'https://backend.example/api/odds/nfl/rushing/?limit=100&cursor=rush%2B');
      assert.equal(options.cache, 'no-store');
      return Response.json(rushingExample);
    };
    const response = await GET(new Request('http://localhost/api/odds/nfl/rushing/?limit=100&cursor=rush%2B&url=ignored'));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  } finally { global.fetch = original; if (base === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL; else process.env.NEXT_PUBLIC_API_BASE_URL = base; }
});
test('rushing displays carries, aggregate efficiency and team defense as context only', () => {
  const html = render(rushingCard);
  for (const text of ['Rushing yards', '62.75', 'yds', 'Carries per game', 'Yards per carry', 'Carry trend adjustment', 'Team run defense is display context only']) assert.ok(html.includes(text), text);
  for (const text of ['Targets per game', 'Catch rate', 'Yards per target', 'Opponent adjustment']) assert.ok(!html.includes(text), text);
  assert.ok(html.includes('<th scope="col">Carries</th>'));
});
test('injury holds suppress current directions on both families while retaining prices and history', () => {
  for (const source of [card, rushingCard]) {
    for (const status of ['out', 'inactive', 'doubtful', 'unknown']) {
      const html = render({ ...source, availability: { status, freshness: 'fresh' } });
      assert.ok(html.includes('Signal on hold'));
      assert.ok(!html.includes('receiving-direction'));
      assert.ok(html.includes('Sportsbook odds'));
      assert.ok(html.includes('Recent performances'));
    }
    for (const freshness of ['stale', 'missing']) {
      const html = render({ ...source, availability: { status: 'not_listed', freshness } });
      assert.ok(!html.includes('receiving-direction'));
      assert.ok(html.includes(`${freshness} report`));
    }
  }
});
test('questionable/probable caveats and qualified teammate evidence are prominent without changing projection', () => {
  for (const status of ['questionable', 'probable']) {
    const html = render({ ...rushingCard, availability: { ...rushingCard.availability, status } });
    assert.ok(html.includes('usual workload'));
    assert.ok(html.includes('receiving-direction'));
    assert.ok(html.indexOf('Player availability') < html.indexOf('Current consensus'));
    assert.ok(html.includes('Example Teammate'));
    assert.ok(html.includes('Supporting usage and injury evidence'));
    assert.ok(html.includes('No numerical injury adjustment or OVER recommendation'));
    assert.ok(html.includes('not a confirmed starter or depth chart'));
    assert.ok(html.includes('62.75'));
  }
  assert.ok(render({ availability: { status: 'not_listed', freshness: 'fresh' } }).includes('does not mean confirmed healthy'));
});
test('late injury notice cannot rewrite the official prediction', () => {
  const html = render({ ...rushingCard, official_prediction: { id: 1, signal, recorded_at: fresh, lock_at: expired },
    late_availability_notice: { status: 'out', freshness: 'fresh', observed_at: fresh } });
  for (const text of ['Late injury update', 'UNDER 78.5', 'Official · Locked', 'immutable official prediction']) assert.ok(html.includes(text), text);
});
test('malformed injury evidence is rejected before rendering and empty legacy context is accepted', () => {
  assert.throws(() => parseReceivingFeed({ ...rushingExample, signals: [{ ...rushingCard, injury_opportunity: { contributors: [{}] } }] }, 'rushing'), /unexpected/);
  assert.throws(() => parseReceivingFeed({ ...example, signals: [{ ...card, availability: { status: 'out', players: {} } }] }), /unexpected/);
  assert.equal(parseReceivingFeed({ ...example, signals: [{ ...card, injury_opportunity: {} }] }).signals.length, 1);
});

test('conditional projections remain visible across NFL props without clearing availability holds', () => {
  for (const source of [card, example.signals.find(s => s.prop === 'receptions'), rushingCard]) {
    for (const value of [0, 64.25]) {
      const change = { ...source, available: false,
        projection: { ...source.projection, final: null, conditional_on_playing: value },
        availability: { status: 'unknown', freshness: 'missing', blocking_reason: 'injury_evidence_stale_or_missing' },
        market: { ...source.market, saved_comparison: { ...savedComparison, projection: null, edge_vs_median: null } } };
      for (const outdated of [false, true]) {
        const html = render(change, { outdated });
        assert.ok(html.includes('Projection · If playing') || html.includes('Saved projection · If playing'));
        assert.ok(html.includes(`<strong>${value} <small>${source.prop === 'receptions' ? 'rec' : 'yds'}</small>`));
        assert.ok(html.includes('usual workload'));
        assert.ok(html.includes('within 24 hours of kickoff'));
        assert.ok(html.includes('Signal on hold'));
        assert.ok(!html.includes('receiving-direction'));
        assert.ok(!html.includes('Live diff.'));
        assert.ok(!html.includes('Saved diff.'));
      }
    }
  }
});
test('conditional projection normalization preserves zero and rejects invalid numbers', () => {
  for (const [raw, expected] of [['64.25', 64.25], ['0', 0], [null, null], ['', null]]) {
    const feed = parseReceivingFeed({ ...example, signals: [{ ...card, projection: { final: null, conditional_on_playing: raw } }] });
    assert.equal(feed.signals[0].projection.conditional_on_playing, expected);
  }
  for (const raw of ['invalid', 'Infinity', true]) {
    assert.throws(() => parseReceivingFeed({ ...example, signals: [{ ...card, projection: { conditional_on_playing: raw } }] }), /unexpected/);
  }
});
test('conditional estimates do not replace available final or frozen official projections', () => {
  const projection = { final: 47.25, conditional_on_playing: 64.25 };
  const available = render({ available: true, projection });
  assert.ok(available.includes('<strong>47.25 <small>yds</small>'));
  assert.ok(!available.includes('If playing'));
  const locked = render({ available: false, projection: { ...projection, final: null },
    official_prediction: { id: 1, signal, recorded_at: fresh, lock_at: expired } });
  assert.ok(locked.includes('Official projection: 62.75'));
  assert.ok(locked.includes('Live projection · If playing'));
  assert.ok(locked.includes('<strong>64.25 <small>yds</small>'));
});
test('slate projection count includes conditional model estimates', async () => {
  const original = global.fetch;
  try {
    global.fetch = async () => Response.json({ ...example, signals: [{ ...card, available: false, projection: { final: null, conditional_on_playing: 0 } }] });
    assert.equal((await loadReceivingFeed()).projection_count, 1);
  } finally { global.fetch = original; }
});

test('if-playing differences use the displayed current or saved line across NFL props', () => {
  for (const source of [card, example.signals.find(s => s.prop === 'receptions'), rushingCard]) {
    const change = { ...source, available: false, projection: { final: null, conditional_on_playing: '80.25' },
      availability: { status: 'unknown', freshness: 'missing' },
      market: { ...source.market, books_available: 2, median_line: 75, saved_comparison: savedComparison,
        books: [savedBook({ line: 75, over_odds: -110, under_odds: -115,
          latest_saved: { over: savedQuote({ line: 72.5 }), under: savedQuote({ line: 70.5 }) } })] } };
    const current = render(change);
    assert.ok(current.includes('Difference · If playing</span><strong>+5.25</strong>'));
    assert.ok(current.includes('+7% vs line'));
    assert.ok(current.includes('If playing · Current line'));
    const stale = render(change, { outdated: true });
    assert.ok(stale.includes('Difference vs saved line · If playing</span><strong>+7.75</strong>'));
    assert.ok(stale.includes('+10.69% vs line'));
    assert.ok(stale.includes('<td>+7.75<small class="receiving-book-status">If playing · Saved line'));
    assert.ok(!stale.includes('<td>+9.75'));
    assert.ok(stale.includes('Signal on hold'));
    assert.ok(!stale.includes('receiving-direction'));
  }
});
test('conditional differences preserve zero, negative and missing lines without reviving withdrawn quotes', () => {
  const base = { available: false, projection: { final: null, conditional_on_playing: 0 } };
  for (const [line, expected] of [[0, '0'], [5, '-5'], [null, '—']]) {
    const html = render({ ...base, market: { ...card.market, median_line: line, saved_comparison: null, books: [] } });
    assert.ok(html.includes(`Difference · If playing</span><strong>${expected}</strong>`));
    assert.ok(!html.includes('NaN'));
    assert.ok(!html.includes('Infinity'));
  }
  for (const status of ['withdrawn', 'invalid_timestamp']) {
    const html = render({ ...base, market: { ...card.market, books: [savedBook({ latest_saved: { over: savedQuote({ status }) } })] } });
    assert.ok(!html.includes('If playing · Current line'));
    assert.ok(!html.includes('If playing · Saved line'));
  }
});
