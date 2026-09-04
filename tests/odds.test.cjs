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
