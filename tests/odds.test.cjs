/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS runner transpiles the source components in memory. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');
// Transpile the actual components for Node's built-in runner; no extra test dependencies.
for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => {
    const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
      fileName: filename,
    });
    module._compile(outputText, filename);
  };
}
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { ODDS_LEAGUES, feedUrl, groupEvents, createFeedLoader } = require('../src/lib/odds.ts');
const { OddsEventCard } = require('../src/app/ui/odds-event-card.tsx');
const signal = { rule: 'favorite_rule', type: 'favorite_win', matched: true, market: 'moneyline', prediction: 'win', predicted_side: 'home', confidence: 'watch', description: 'The home favorite qualifies.', reason: 'Fallback description', threshold: 10, observed_value: 20, context: { sample_size: 30, nested: { enabled: true, price: null } } };
const event = { id: 1, sport: 'baseball', league: 'mlb', start_time: '2026-09-04T19:00:00-07:00', away_team: 'Giants', home_team: 'Dodgers', odds_status: 'available', odds: { home_ml: -150, away_ml: 130, home_spread: -1.5, home_spread_ml: 115, away_spread: 1.5, away_spread_ml: -135, total_line: 8.5, over_ml: -110, under_ml: -110, captured_at: '2026-09-04T17:00:00-07:00' }, signal_count: 1, signals: [signal] };
const render = (changes = {}) => renderToStaticMarkup(React.createElement(OddsEventCard, { event: { ...event, ...changes }, onRetry() {} }));
const response = (id) => Response.json({ count: 1, signal_count: 0, upcoming_days: 3, window_start_date: '2026-09-04', window_end_date: '2026-09-06', events: [{ ...event, id }], matches: [] });

test('exact league feed mappings', () => {
  assert.deepEqual(ODDS_LEAGUES.map(feedUrl), ['/api/odds/pregame/?sport=soccer&league=uefa.champions', '/api/odds/pregame/?sport=soccer&league=eng.1', '/api/odds/pregame/?sport=soccer&league=esp.1', '/api/odds/pregame/?sport=football&league=nfl', '/api/odds/pregame/?sport=baseball&league=mlb']);
});

test('groups only supplied events by local calendar day across midnight and DST', () => {
  process.env.TZ = 'America/Los_Angeles';
  const groups = groupEvents([
    { ...event, id: 3, start_time: '2026-11-03T02:00:00Z' },
    { ...event, id: 2, start_time: '2026-11-01T09:30:00Z' },
    { ...event, id: 1, start_time: '2026-11-01T06:30:00Z' },
  ], new Date('2026-10-31T12:00:00-07:00'));
  assert.deepEqual(groups.map(g => [g.key, g.label, g.events.map(e => e.id)]), [
    ['2026-10-31', 'Today', [1]], ['2026-11-01', 'Tomorrow', [2]], ['2026-11-02', 'Day after tomorrow', [3]],
  ]);
  assert.deepEqual(groupEvents([]), []);
});

test('every conflicting signal has its own summary, team and full trigger details', () => {
  const html = render({ signal_count: 2, signals: [signal, { ...signal, rule: 'upset_rule', type: 'underdog_upset', predicted_side: 'away', description: null }], signal: { ...signal, description: 'IGNORE SINGULAR SIGNAL' } });
  assert.equal((html.match(/Why this signal\?/g) || []).length, 2);
  for (const expected of ['2 signals', 'favorite_rule', 'upset_rule', 'Predicted side / team', 'home / Dodgers', 'away / Giants', 'Observed value', '>20<', 'Configured threshold', '>10<', 'Confidence', 'watch', 'Sample size', 'Enabled: true', 'Fallback description']) assert.ok(html.includes(expected), expected);
  assert.ok(!html.includes('IGNORE SINGULAR SIGNAL'));
});

test('raw context JSON is available in development and hidden in production', () => {
  const previous = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'development'; assert.ok(render().includes('Raw context JSON'));
    process.env.NODE_ENV = 'production'; assert.ok(!render().includes('Raw context JSON'));
  } finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; }
});

test('exclusions retain the event and render every explanation', () => {
  const html = render({ signals: [], signal_count: 0, signal_exclusions: [{ rule: 'excluded', description: 'Favorite excluded.' }, { rule: 'second', description: 'Another exclusion.' }] });
  for (const expected of ['Giants', 'Dodgers', 'Filtered signal', 'Favorite excluded.', 'Another exclusion.']) assert.ok(html.includes(expected));
  assert.ok(!html.includes('No active signals'));
});

test('null odds and missing context remain readable, with no singular signal fallback', () => {
  const html = render({ odds: null, signals: [], signal_count: 0, signal: signal });
  for (const expected of ['Odds pending', '—', 'No active signals', 'TBD', 'Injury data not available']) assert.ok(html.includes(expected));
  assert.ok(!html.includes('undefined')); assert.ok(!html.includes('null')); assert.ok(!html.includes('Why this signal?'));
});

test('status states do not present stale odds as available and errors offer retry', () => {
  for (const [status, label] of [['unknown', 'Odds pending'], ['unavailable', 'Odds unavailable'], ['error', 'Couldn’t load odds']]) {
    const html = render({ odds_status: status, odds_status_reason: 'Provider has no current line', signals: [] });
    assert.ok(html.includes(label)); assert.ok(html.includes('Provider has no current line')); assert.ok(!html.includes('-150'));
    assert.equal(html.includes('Retry odds'), status === 'error');
  }
});

test('MLB shows team records, pitcher stats and supplied injury return only', () => {
  const html = render({ matchup_context: { teams: { home: { record: '62-48' }, away: { record: '58-52' } }, starting_pitchers: { home: { name: 'Home Pitcher', record: '10-4', era: 3.21, whip: 1.08 }, away: null }, injuries: { home: [], away: [{ player_name: 'Outfielder', status: 'Injured List', injury: 'Hamstring strain', expected_return: 'Sep 12' }, { player_name: 'Catcher', injury: 'Knee' }] } } });
  for (const expected of ['62-48', '58-52', 'Home Pitcher', '10-4', 'ERA 3.21', 'WHIP 1.08', 'TBD', 'Outfielder', 'Hamstring strain', 'Sep 12', 'No active injuries reported']) assert.ok(html.includes(expected), expected);
  assert.equal((html.match(/Expected return:/g) || []).length, 1);
});

test('sport markets include soccer draw only when supplied, run line and totals', () => {
  const soccer = render({ sport: 'soccer', league: 'uefa.champions', odds: { ...event.odds, draw_ml: 240 } });
  assert.ok(soccer.includes('Draw')); assert.ok(soccer.includes('+240')); assert.ok(!soccer.includes('Starting pitchers'));
  const baseball = render(); assert.ok(!baseball.includes('Draw')); assert.ok(baseball.includes('Run line')); assert.ok(baseball.includes('Total 8.5'));
  assert.ok(!render({ sport: 'football', league: 'nfl', odds: { draw_ml: null } }).includes('Draw'));
});

test('MLB market outlook and fresh split values preserve sub-60 and zero percentages', () => {
  const html = render({
    market_outlook: { home_implied_probability: 0.573379, away_implied_probability: 0.426621 },
    betting_splits: {
      status: 'fresh', signal_eligible: true, captured_at: '2026-09-04T16:00:00-07:00',
      last_checked_at: '2026-09-04T17:05:00-07:00', age_seconds: 60, max_age_seconds: 900,
      moneyline: {
        away: { valid: true, odds: 130, bet_pct: 0, handle_pct: 20, money_differential: 20, bet_pct_change: 0, handle_pct_change: -2 },
        home: { valid: true, odds: -150, bet_pct: 100, handle_pct: 80, money_differential: -20 },
      },
    },
  });
  for (const expected of ['Market-implied win probability', '57.3%', '42.7%', 'Betting splits', 'VSiN · DraftKings', 'Bets = share of tickets', '>0%<small>', '>100%</span>', '+20 pp', '0 pp', '-2 pp', 'Eligible for split-based signals', 'Last checked']) assert.ok(html.includes(expected), expected);
});

test('MLB split statuses are distinct while independent signals remain visible', () => {
  const states = [
    ['unavailable', 'Betting splits are not available for this game yet.'],
    ['invalid_moneyline', 'Moneyline splits are incomplete or invalid.'],
    ['disabled', 'Betting splits are currently disabled.'],
    [undefined, 'Betting splits are not available for this game yet.'],
    ['unexpected', 'Betting splits are not available for this game yet.'],
  ];
  for (const [status, message] of states) {
    const html = render({ betting_splits: status === undefined ? null : { status }, signals: [signal] });
    assert.ok(html.includes(message), String(status));
    assert.ok(html.includes('Fallback description'), String(status));
  }
  const stale = render({ betting_splits: { status: 'stale', signal_eligible: false, last_checked_at: '2026-09-04T17:00:00-07:00', age_seconds: 901, max_age_seconds: 900, moneyline: { away: { bet_pct: 44, handle_pct: 60, money_differential: 16 }, home: { bet_pct: 56, handle_pct: 40, money_differential: -16 } } } });
  for (const expected of ['Out of date', '44%', '60%', '+16 pp', 'Past freshness window']) assert.ok(stale.includes(expected), expected);
  assert.ok(!stale.includes('Eligible for split-based signals'));
});

test('MLB specialized rules show exact labels, weak styling, and saved evidence', () => {
  const reverse = { ...signal, rule: 'mlb_public_bets_underdog_moneyline_move', predicted_side: 'away', strength: 'standard', context: { public_bet_side: 'home', public_bet_pct: 68, underdog_open_ml: 145, underdog_current_ml: 125, underdog_move_toward: 'favorite' } };
  const runLine = { ...signal, rule: 'mlb_losing_record_favorable_runline', type: 'runline_cover', predicted_side: 'away', strength: 'standard', market: 'spread', prediction: 'cover', context: { spread_odds: -115, wins: 40, losses: 55, supporting_rules: ['record', 'price'] } };
  const weak = { ...signal, rule: 'opening_to_current_movement_weak_favorite', strength: 'weak' };
  const html = render({ signals: [reverse, runLine, weak], signal_count: 99 });
  for (const expected of ['3 signals', 'Public bets / opposing line movement', 'home / Dodgers', '68%', '+145', '+125', 'Giants +1.5', '-115', '40-55', 'record, price', 'Small line movement — weak favorite support', 'Weak signal', 'event-signal-weak', 'not a verified win probability']) assert.ok(html.includes(expected), expected);
});

test('empty authoritative signals, exclusions, and null MLB context do not suppress the game', () => {
  const html = render({
    signal_count: 4, signals: [], signal: signal, matchup_context: null, market_outlook: null,
    betting_splits: { status: 'unavailable' },
    signal_exclusions: [{ rule: 'backend_suppressed', description: 'Suppressed by backend policy.' }],
  });
  for (const expected of ['0 signals', 'Giants', 'Dodgers', 'Suppressed by backend policy.', 'Betting splits are not available']) assert.ok(html.includes(expected), expected);
  assert.ok(!html.includes('The home favorite qualifies.'));
  assert.ok(!html.includes('Market-implied win probability'));
});

test('failed background refresh labels retained cards as cached', () => {
  const html = render({ betting_splits: { status: 'unavailable' } });
  assert.ok(!html.includes('Cached data'));
  const cachedHtml = renderToStaticMarkup(React.createElement(OddsEventCard, { event, onRetry() {}, dataOutdated: true }));
  assert.ok(cachedHtml.includes('Cached data · latest refresh failed'));
});

test('switching leagues aborts the previous request and ignores late responses and completion', async () => {
  const pending = []; const seen = []; const errors = []; let completed = 0;
  const loader = createFeedLoader((url, options) => new Promise(resolve => pending.push({ url, options, resolve })));
  const first = loader.load(ODDS_LEAGUES[0], d => seen.push(d.events[0].id), e => errors.push(e), () => completed++);
  const second = loader.load(ODDS_LEAGUES.find(league => league.key === 'mlb'), d => seen.push(d.events[0].id), e => errors.push(e), () => completed++);
  assert.equal(pending[0].options.signal.aborted, true);
  pending[1].resolve(response(2)); await second;
  pending[0].resolve(response(1)); await first;
  assert.deepEqual(seen, [2]); assert.deepEqual(errors, []); assert.equal(completed, 1);
});

test('cancel ignores late failures; retry uses the selected league and canonical events', async () => {
  let rejectPending; let failures = 0; let done = 0;
  const cancelled = createFeedLoader(() => new Promise((_, reject) => { rejectPending = reject; }));
  const pending = cancelled.load(ODDS_LEAGUES.find(league => league.key === 'nfl'), () => assert.fail(), () => failures++, () => done++);
  cancelled.cancel(); rejectPending(new Error('late')); await pending;
  assert.equal(failures, 0); assert.equal(done, 0);
  const urls = []; let requests = 0; let result;
  const loader = createFeedLoader(async url => { urls.push(url); return requests++ === 0 ? new Response('', { status: 503 }) : response(9); });
  await loader.load(ODDS_LEAGUES.find(league => league.key === 'nfl'), () => assert.fail(), () => failures++, () => done++);
  await loader.load(ODDS_LEAGUES.find(league => league.key === 'nfl'), data => result = data, () => assert.fail(), () => done++);
  assert.equal(failures, 1); assert.equal(done, 2); assert.equal(result.events[0].id, 9); assert.deepEqual(urls, [feedUrl(ODDS_LEAGUES.find(league => league.key === 'nfl')), feedUrl(ODDS_LEAGUES.find(league => league.key === 'nfl'))]);
});

test('proxy forwards exact query and upstream status without changing legacy endpoints', async () => {
  const originalFetch = global.fetch;
  const oldBase = process.env.NEXT_PUBLIC_API_BASE_URL;
  process.env.NEXT_PUBLIC_API_BASE_URL = 'https://odds.example.test/';
  const { GET } = require('../src/app/api/odds/pregame/route.ts');
  const requests = [];
  try {
    global.fetch = async (url, options) => { requests.push({ url, options }); return Response.json({ detail: 'Upstream response' }, { status: 429 }); };
    for (const league of ODDS_LEAGUES) {
      const result = await GET(new Request(`http://localhost${feedUrl(league)}`));
      assert.equal(result.status, 429);
      assert.deepEqual(await result.json(), { detail: 'Upstream response' });
      assert.equal(requests.at(-1).url, `https://odds.example.test/api/odds/pregame/?sport=${league.sport}&league=${league.league}`);
      assert.equal(requests.at(-1).options.cache, 'no-store');
    }
    const invalid = await GET(new Request('http://localhost/api/odds/pregame/?sport=soccer&league=mlb'));
    assert.equal(invalid.status, 400); assert.equal(requests.length, ODDS_LEAGUES.length);
    global.fetch = async () => { throw new Error('offline'); };
    assert.equal((await GET(new Request(`http://localhost${feedUrl(ODDS_LEAGUES[0])}`))).status, 502);
  } finally {
    global.fetch = originalFetch;
    if (oldBase === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL; else process.env.NEXT_PUBLIC_API_BASE_URL = oldBase;
  }
});

const { moneyline } = require('../src/lib/odds.ts');
const { historyUrl, parseHistory, precedingSnapshot, formatMovement, createHistoryStore, HISTORY_MAX_AGE } = require('../src/lib/odds-history.ts');
const { HistoryContent, HistoryTable } = require('../src/app/ui/odds-history.tsx');
const historyEvent = { ...event, provider: 'espn', provider_event_id: '401816854' };
const historyPath = historyUrl(historyEvent);
const snapshot = (snapshot_id, captured_at, changes = {}) => ({ snapshot_id, captured_at, away_ml: 130, home_ml: -150, draw_ml: null, line_phase: 'current', ...changes });
const firstSnapshot = snapshot(1, '2026-09-08T10:00:00Z');
const secondSnapshot = snapshot(2, '2026-09-08T11:00:00Z', { away_ml: 140, home_ml: -160 });
const historyResponse = (history = [firstSnapshot, secondSnapshot]) => Response.json({ provider: 'espn', provider_event_id: '401816854', sport: 'baseball', league: 'mlb', history });
const historyMarkup = (state) => renderToStaticMarkup(React.createElement(HistoryContent, { state, event: historyEvent, retry() {} }));

test('opening and current moneylines appear together for every configured league', () => {
  for (const league of ODDS_LEAGUES) {
    const html = render({ sport: league.sport, league: league.league, odds: { home_ml: -150, away_ml: 130, open_home_ml: -140, open_away_ml: 120, ...(league.sport === 'soccer' ? { draw_ml: 250, open_draw_ml: 240 } : {}) } });
    for (const value of ['Opening', 'Current', '-150', '+130', '-140', '+120', 'Odds history']) assert.ok(html.includes(value), `${league.key} ${value}`);
    if (league.sport === 'soccer') for (const value of ['Draw', '+250', '+240']) assert.ok(html.includes(value));
    else assert.ok(!html.includes('Draw'));
  }
});

test('missing opening lines stay missing, including with signal evidence; zero prices are valid', () => {
  assert.equal(moneyline(0), '0'); assert.equal(moneyline(null), '—'); assert.equal(moneyline(undefined), '—'); assert.equal(moneyline(NaN), '—');
  const html = render({ odds: { home_ml: -150, away_ml: 130 }, signals: [{ ...signal, context: { open_home_ml: -999 } }] });
  assert.equal((html.match(/<span>Opening<\/span><strong>—<\/strong>/g) || []).length, 2);
  assert.ok(html.includes('<strong class="odds-value">-150</strong>'));
  const zero = render({ sport: 'soccer', odds: { home_ml: 0, away_ml: 0, draw_ml: 0, open_home_ml: 0, open_draw_ml: 0, open_away_ml: 0 } });
  assert.equal((zero.match(/<strong>0<\/strong>/g) || []).length, 3);
  assert.equal((zero.match(/class="odds-value">0<\/strong>/g) || []).length, 3);
  const drawOpeningOnly = render({ sport: 'soccer', odds: { open_draw_ml: 240 } });
  assert.ok(drawOpeningOnly.includes('Draw')); assert.ok(drawOpeningOnly.includes('+240'));
});

test('history URL uses provider identity, sport and league for every league, never internal event id', () => {
  for (const league of ODDS_LEAGUES) {
    assert.equal(historyUrl({ ...historyEvent, sport: league.sport, league: league.league }), `/api/odds/history/espn/401816854/?sport=${league.sport}&league=${league.league}`);
  }
  assert.equal(historyUrl(event), null);
  assert.equal(historyUrl({ ...historyEvent, league: 'unknown' }), null);
  assert.equal(historyUrl({ ...event, espn_event_id: '123' }), '/api/odds/history/espn/123/?sport=baseball&league=mlb');
  assert.notEqual(historyUrl(historyEvent), historyUrl({ ...historyEvent, provider: 'other' }));
});

test('history sorts oldest first, deduplicates snapshots and safely handles identical timestamps', () => {
  const tied = snapshot(3, secondSnapshot.captured_at, { away_ml: 145 });
  const fourth = snapshot(4, '2026-09-08T12:00:00Z');
  const rows = parseHistory({ history: [fourth, tied, firstSnapshot, secondSnapshot, firstSnapshot] }, historyPath).history;
  assert.deepEqual(rows.map(row => row.snapshot_id), [1, 2, 3, 4]);
  assert.equal(precedingSnapshot(rows, 1), undefined);
  assert.equal(precedingSnapshot(rows, 2), undefined);
  assert.equal(precedingSnapshot(rows, 3), undefined);
  assert.deepEqual(parseHistory({ history: [tied, secondSnapshot, firstSnapshot, fourth] }, historyPath).history, rows);
  assert.equal(parseHistory({ history: [firstSnapshot, { ...firstSnapshot, snapshot_id: 99 }] }, historyPath).history.length, 1);
  assert.throws(() => parseHistory({ history: [firstSnapshot, { ...firstSnapshot, away_ml: 999 }] }, historyPath), /malformed/);
});

test('movement never joins sportsbook providers or ambiguous/sub-millisecond capture groups', () => {
  const other = snapshot(3, '2026-09-08T10:30:00Z', { provider_id: '200', provider_name: 'Other book', away_ml: 999 });
  const rows = parseHistory({ history: [secondSnapshot, other, firstSnapshot] }, historyPath).history;
  assert.equal(precedingSnapshot(rows, 1), undefined);
  assert.equal(precedingSnapshot(rows, 2).snapshot_id, 1);
  const micro = parseHistory({ history: [snapshot(1, '2026-09-08T10:00:00.000001Z'), snapshot(2, '2026-09-08T10:00:00.000002Z', { away_ml: 140 })] }, historyPath).history;
  assert.equal(precedingSnapshot(micro, 1), undefined);
  const phase = parseHistory({ history: [firstSnapshot, { ...secondSnapshot, line_phase: 'archived' }] }, historyPath).history;
  assert.equal(precedingSnapshot(phase, 1), undefined);
});

test('movement explains longer and shorter prices, even-money transitions and unavailable calculations', () => {
  assert.equal(formatMovement(140, 130), '+10 ML pts · Longer odds');
  assert.equal(formatMovement(-160, -150), '-10 ML pts · Shorter odds');
  assert.equal(formatMovement(-140, -150), '+10 ML pts · Longer odds');
  assert.equal(formatMovement(120, 130), '-10 ML pts · Shorter odds');
  assert.equal(formatMovement(130, 130), '0 · No change');
  assert.equal(formatMovement(-110, 110), '-220 ML pts · Shorter odds (crosses even money)');
  assert.equal(formatMovement(100, -100), '+200 ML pts · Same payout (crosses even money)');
  for (const [current, prior] of [[0, 100], [100, 0], [undefined, 120], [120, null], [Infinity, 100], [20, 10]]) assert.equal(formatMovement(current, prior), '—');
});

test('history tables show all moneylines, supplied phases only, capture times and neutral movement', () => {
  const data = parseHistory({ history: [secondSnapshot, firstSnapshot] }, historyPath);
  const html = historyMarkup({ data, loading: false });
  for (const expected of ['Sportsbook moneyline snapshots', 'DraftKings', 'Current', '+10 ML pts', 'Longer odds', '-10 ML pts', 'Shorter odds', 'does not indicate a favorable bet', '2026-09-08T10:00:00Z']) assert.ok(html.includes(expected), expected);
  assert.ok(html.indexOf('2026-09-08T10:00:00Z') < html.indexOf('2026-09-08T11:00:00Z'));
  assert.ok(!html.includes('Opening'));
  const soccerData = parseHistory({ history: [{ ...firstSnapshot, draw_ml: 0, line_phase: 'opening' }] }, historyPath);
  const soccer = renderToStaticMarkup(React.createElement(HistoryTable, { data: soccerData, event: { ...historyEvent, sport: 'soccer' } }));
  for (const expected of ['Draw', 'Opening', '<strong>0</strong>']) assert.ok(soccer.includes(expected));
});

test('empty, malformed, wrong-event and unavailable history never crash cards', async () => {
  const data = parseHistory({ history: [] }, historyPath);
  assert.ok(historyMarkup({ data, loading: false }).includes('No odds snapshots'));
  for (const payload of [null, [], {}, { history: null }, { history: {} }, { history: [null] }, { history: [{ ...firstSnapshot, captured_at: 'bad' }] }, { history: [{ ...firstSnapshot, away_ml: '130' }] }, { history: [firstSnapshot], provider_event_id: 'different' }, { history: [firstSnapshot], league: 'nfl' }]) assert.throws(() => parseHistory(payload, historyPath), /malformed/);
  for (const status of [404, 204, 503]) {
    const store = createHistoryStore(async () => new Response(null, { status }));
    await store.load(historyPath);
    assert.ok(historyMarkup(store.getSnapshot(historyPath)).includes('Retry history'));
    assert.match(store.getSnapshot(historyPath).error, status === 503 ? /503/ : /unavailable/);
  }
  const malformed = createHistoryStore(async () => Response.json({ history: [null] }));
  await malformed.load(historyPath); assert.match(malformed.getSnapshot(historyPath).error, /malformed/);
});

test('history remains lazy, shares requests, caches per event and refreshes after cache age', async () => {
  let now = 0; let calls = 0; let resolve;
  const store = createHistoryStore(() => { calls++; return new Promise(done => { resolve = done; }); }, () => now);
  const unsubscribe = store.subscribe(historyPath, () => {});
  assert.equal(calls, 0);
  const first = store.load(historyPath); const duplicate = store.load(historyPath, true);
  assert.equal(first, duplicate); assert.equal(calls, 1);
  resolve(historyResponse()); await first;
  await store.load(historyPath); assert.equal(calls, 1);
  unsubscribe(); const subscribeAgain = store.subscribe(historyPath, () => {});
  await store.load(historyPath); assert.equal(calls, 1);
  now = HISTORY_MAX_AGE;
  const refresh = store.load(historyPath); assert.equal(calls, 2);
  assert.equal(store.getSnapshot(historyPath).data.history.length, 2);
  resolve(historyResponse()); await refresh;
  assert.equal(store.getSnapshot(historyPath).updatedAt, now);
  subscribeAgain();
});

test('failed history refresh retains stale data, renders a warning, and retry restores it', async () => {
  let calls = 0;
  const store = createHistoryStore(async () => ++calls === 2 ? new Response(null, { status: 503 }) : historyResponse());
  await store.load(historyPath); const saved = store.getSnapshot(historyPath).data;
  await store.load(historyPath, true);
  assert.equal(store.getSnapshot(historyPath).data, saved);
  const html = historyMarkup(store.getSnapshot(historyPath));
  for (const expected of ['may be outdated', 'Retry history', 'DraftKings', '+130']) assert.ok(html.includes(expected));
  await store.load(historyPath, true);
  assert.equal(store.getSnapshot(historyPath).error, undefined); assert.equal(calls, 3);
});

test('unmount/event/league changes cancel requests and ignore late successes and failures', async () => {
  const pending = [];
  const store = createHistoryStore((url, options) => new Promise((resolve, reject) => pending.push({ url, options, resolve, reject })));
  let notifications = 0;
  const unsubscribe = store.subscribe(historyPath, () => notifications++);
  const first = store.load(historyPath);
  unsubscribe(); assert.equal(pending[0].options.signal.aborted, true);
  const secondPath = historyUrl({ ...historyEvent, provider_event_id: 'nfl-event', sport: 'football', league: 'nfl' });
  const unsubscribeSecond = store.subscribe(secondPath, () => {});
  const second = store.load(secondPath);
  pending[0].resolve(historyResponse()); await first;
  assert.equal(store.getSnapshot(historyPath).data, undefined); assert.equal(notifications, 1);
  unsubscribeSecond(); pending[1].reject(new Error('late failure')); await second;
  assert.equal(store.getSnapshot(secondPath).error, undefined);
  const third = store.load(historyPath); const unsubThird = store.subscribe(historyPath, () => {});
  pending[2].resolve(historyResponse()); await third; assert.ok(store.getSnapshot(historyPath).data); unsubThird();
});

test('one subscriber leaving does not cancel another card; cancelled data cannot overwrite a newer request', async () => {
  const pending = [];
  const store = createHistoryStore((url, options) => new Promise(resolve => pending.push({ options, resolve })));
  const a = store.subscribe(historyPath, () => {}); const b = store.subscribe(historyPath, () => {});
  const first = store.load(historyPath); a(); assert.equal(pending[0].options.signal.aborted, false);
  b(); assert.equal(pending[0].options.signal.aborted, true);
  const c = store.subscribe(historyPath, () => {}); const second = store.load(historyPath);
  pending[1].resolve(historyResponse([secondSnapshot])); await second;
  pending[0].resolve(historyResponse([firstSnapshot])); await first;
  assert.equal(store.getSnapshot(historyPath).data.history[0].snapshot_id, 2); c();
});

test('canonical feed does not concatenate the duplicate matches compatibility alias', async () => {
  let feed;
  const loader = createFeedLoader(async () => Response.json({ events: [event], matches: [event, { ...event, id: 2 }] }));
  await loader.load(ODDS_LEAGUES[4], result => { feed = result; }, () => assert.fail(), () => {});
  assert.deepEqual(groupEvents(feed.events).flatMap(group => group.events.map(row => row.id)), [1]);
  const source = fs.readFileSync(require.resolve('../src/app/ui/dashboard.tsx'), 'utf8');
  assert.ok(source.includes('groupEvents(data?.events ?? [])')); assert.ok(!source.includes('data?.matches'));
});

test('generic history proxy supports all leagues, forwards cancellation and status, validates identifiers', async () => {
  const originalFetch = global.fetch; const oldBase = process.env.NEXT_PUBLIC_API_BASE_URL;
  process.env.NEXT_PUBLIC_API_BASE_URL = 'https://odds.example.test/';
  const { GET } = require('../src/app/api/odds/history/[provider]/[providerEventId]/route.ts');
  const context = { params: Promise.resolve({ provider: 'espn', providerEventId: '123' }) };
  const requests = [];
  try {
    global.fetch = async (url, options) => { requests.push({ url, options }); return Response.json({ history: [] }); };
    for (const league of ODDS_LEAGUES) {
      const path = historyUrl({ ...historyEvent, provider_event_id: '123', sport: league.sport, league: league.league });
      const request = new Request(`http://localhost${path}`);
      assert.equal((await GET(request, context)).status, 200);
      assert.equal(requests.at(-1).url, `https://odds.example.test${path}`);
      assert.equal(requests.at(-1).options.signal, request.signal);
      assert.equal(requests.at(-1).options.cache, 'no-store');
    }
    assert.equal((await GET(new Request(`http://localhost${historyPath}`), { params: Promise.resolve({ provider: '..', providerEventId: '123' }) })).status, 400);
    assert.equal((await GET(new Request('http://localhost/api/odds/history/espn/123/?sport=soccer&league=mlb'), context)).status, 400);
    for (const status of [204, 404, 429]) {
      global.fetch = async () => new Response(null, { status });
      assert.equal((await GET(new Request(`http://localhost${historyPath}`), context)).status, status);
    }
    global.fetch = async () => { throw new Error('offline'); };
    assert.equal((await GET(new Request(`http://localhost${historyPath}`), context)).status, 502);
  } finally { global.fetch = originalFetch; if (oldBase === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL; else process.env.NEXT_PUBLIC_API_BASE_URL = oldBase; }
});

test('initial transport failure retries successfully and malformed refresh retains cached history', async () => {
  let calls = 0;
  const store = createHistoryStore(() => {
    calls++;
    if (calls === 1) throw new Error('Network offline');
    return Promise.resolve(calls === 3 ? Response.json({ history: 'broken' }) : historyResponse());
  });
  await store.load(historyPath); assert.match(store.getSnapshot(historyPath).error, /offline/);
  await store.load(historyPath, true); const saved = store.getSnapshot(historyPath).data;
  assert.ok(saved); assert.equal(store.getSnapshot(historyPath).error, undefined);
  await store.load(historyPath, true);
  assert.equal(store.getSnapshot(historyPath).data, saved); assert.match(store.getSnapshot(historyPath).error, /malformed/);
});

test('cached histories remain isolated by provider, event, sport and league', async () => {
  const store = createHistoryStore(async () => Response.json({ history: [firstSnapshot] }));
  await store.load(historyPath);
  for (const changed of [{ provider: 'other' }, { provider_event_id: 'different' }, { sport: 'football', league: 'nfl' }, { sport: 'soccer', league: 'eng.1' }]) {
    const path = historyUrl({ ...historyEvent, ...changed });
    assert.equal(store.getSnapshot(path).data, undefined);
    await store.load(path); assert.ok(store.getSnapshot(path).data);
  }
  assert.ok(store.getSnapshot(historyPath).data);
});
const soccerSignals = [
  { ...signal, rule: 'draw_matches_opening', type: 'draw', tier: 'primary', label: 'Draw matches opening', predicted_side: 'draw', prediction: 'draw', description: 'Backend draw description.', context: { opening_ml: 270, current_ml: 270, draw_history: { status: 'moved_and_returned', prior_valid_readings: 2, departure_recorded: true } } },
  { ...signal, rule: 'match_over_1_5_goals', type: 'over_1_5', tier: 'primary', label: 'Match over 1.5 goals', market: 'total', predicted_side: 'over_1_5', prediction: 'over_1_5', context: { total_scope: 'match', qualifying_teams: [{ side: 'home', current_ml: -240 }, { side: 'away', current_ml: 260 }] } },
  { ...signal, rule: 'opening_underdog_shortening', tier: 'primary', label: 'Underdog movement / upset watch', predicted_side: 'away', context: { opening_role: 'underdog', team: 'Away Club', opening_ml: 110, current_ml: -115, movement_points: 25, movement_direction: 'shortening', movement_method: 'continuous_american_points' } },
  { ...signal, rule: 'opening_favorite_shortening', tier: 'alternate', label: 'Opening favorite support (alternate)', predicted_side: 'home', context: { opening_role: 'favorite', opening_ml: 160, current_ml: 130, movement_points: 30, movement_direction: 'shortening' } },
  { ...signal, rule: 'draw_underdog_exact_gap', tier: 'secondary', label: 'Exact draw–underdog gap (secondary)' },
  { ...signal, rule: 'positive_favorite_upset', tier: 'secondary', label: 'Positive favorite upset watch (secondary)', predicted_side: 'away' },
];
const soccerEvent = { ...historyEvent, sport: 'soccer', league: 'eng.1', home_team: 'Home Club', away_team: 'Away Club', signals: soccerSignals, signal_count: 6 };

test('soccer keeps all backend signals in order with tier badges and backend labels', () => {
  const html = render(soccerEvent);
  assert.equal((html.match(/Why this signal\?/g) || []).length, 6);
  assert.equal((html.match(/class="signal-tier signal-tier-primary"/g) || []).length, 3);
  assert.equal((html.match(/class="signal-tier signal-tier-alternate"/g) || []).length, 1);
  assert.equal((html.match(/class="signal-tier signal-tier-secondary"/g) || []).length, 2);
  let last = -1;
  for (const row of soccerSignals) {
    const index = html.indexOf(row.label.replaceAll('&', '&amp;'));
    assert.ok(index > last, row.label); last = index;
  }
  for (const expected of ['6 signals', 'Backend draw description.', 'Match total over 1.5 goals', 'Home Club', 'Away Club', 'Qualifying team prices', '-240', '+260', '25 points · Shortening', '+110', '-115', 'Opening underdog movement', 'Opening favorite movement', 'Team roles are fixed at opening.']) assert.ok(html.includes(expected), expected);
});

test('draw history states remain distinct and never claim an unobserved unchanged market', () => {
  for (const [status, label] of [['moved_and_returned', 'Moved and returned'], ['no_departure_recorded', 'No departure recorded'], ['history_unavailable', 'History unavailable']]) {
    const html = render({ ...soccerEvent, signals: [{ ...soccerSignals[0], context: { draw_history: { status } } }] });
    assert.ok(html.includes(label));
    if (status === 'no_departure_recorded') assert.ok(html.includes('Movement between readings is unknown.'));
    if (status === 'history_unavailable') assert.ok(html.includes('Earlier draw movement cannot be established'));
    assert.ok(!html.includes('undefined')); assert.ok(!html.includes('NaN'));
  }
});

test('frontend does not generate signals from qualifying prices or infer tiers on older payloads', () => {
  const empty = render({ ...soccerEvent, signals: [], signal_count: 0, odds: { home_ml: -500, away_ml: 900, draw_ml: 270, open_draw_ml: 270 }, signal: soccerSignals[0] });
  assert.ok(!empty.includes('Why this signal?'));
  const old = render({ ...soccerEvent, signals: [signal], signal_count: 1 });
  assert.ok(old.includes('Favorite rule')); assert.ok(!old.includes('signal-tier-'));
  const newLabel = render({ ...soccerEvent, signals: [{ ...signal, label: 'Server supplied label', tier: 'alternate', context: null }] });
  assert.ok(newLabel.includes('Server supplied label')); assert.ok(newLabel.includes('Alternate'));
});

test('soccer history preserves each snapshot signal payload and does not borrow later evidence', () => {
  const url = historyUrl(soccerEvent);
  const snapshots = [
    { ...firstSnapshot, signals: [{ ...soccerSignals[0], context: { draw_history: { status: 'history_unavailable' } } }], signal_count: 1 },
    { ...secondSnapshot, signals: soccerSignals, signal_count: 6 },
  ];
  const data = parseHistory({ history: snapshots }, url);
  assert.deepEqual(data.history[0].signals, snapshots[0].signals);
  assert.deepEqual(data.history[1].signals, soccerSignals);
  const html = renderToStaticMarkup(React.createElement(HistoryTable, { data, event: soccerEvent }));
  assert.equal((html.match(/Why this signal\?/g) || []).length, 7);
  assert.ok(html.indexOf('History unavailable') < html.indexOf('Moved and returned'));
  assert.ok(html.includes('Signals at this snapshot · 1'));
  assert.ok(html.includes('Signals at this snapshot · 6'));
  const missing = renderToStaticMarkup(React.createElement(HistoryTable, { data: parseHistory({ history: [firstSnapshot, { ...secondSnapshot, signals: [], signal_count: 0 }] }, url), event: soccerEvent }));
  assert.ok(missing.includes('Signal history unavailable.')); assert.ok(missing.includes('No signals at this snapshot.'));
  assert.ok(!missing.includes('Why this signal?'));
});

test('equal-price snapshots with different signal evidence remain separate', () => {
  const data = parseHistory({ history: [{ ...firstSnapshot, signals: [soccerSignals[0]] }, { ...firstSnapshot, snapshot_id: 2, signals: [soccerSignals[1]] }] }, historyUrl(soccerEvent));
  assert.equal(data.history.length, 2);
});

test('soccer-only route uses the shared dashboard while NFL/MLB retain their display', () => {
  const { Dashboard } = require('../src/app/ui/dashboard.tsx');
  const html = renderToStaticMarkup(React.createElement(Dashboard, { soccerOnly: true }));
  for (const label of ['Champions League', 'Premier League', 'La Liga']) assert.ok(html.includes(label));
  for (const label of ['>NFL<', '>MLB<']) assert.ok(!html.includes(label));
  const page = fs.readFileSync(require.resolve('../src/app/soccer/page.tsx'), 'utf8');
  assert.ok(page.includes('../ui/dashboard')); assert.ok(page.includes('soccerOnly'));
  for (const sport of ['football', 'baseball']) {
    const old = render({ sport, signals: [signal] });
    assert.ok(old.includes('Fallback description')); assert.ok(!old.includes('Soccer signal evidence'));
    assert.ok(!old.includes('signal-tier-'));
  }
});
