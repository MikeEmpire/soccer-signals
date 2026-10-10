/* eslint-disable @typescript-eslint/no-require-imports -- Dependency-free test runner. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');
for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true }, fileName: filename,
  }).outputText, filename);
}
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { parseReceivingFeed, loadReceivingFeed } = require('../src/lib/nfl-receiving.ts');
const { displayTDSide, tdSignalIsCurrent, tdComparison } = require('../src/lib/nfl-touchdown.ts');
const { NFLTouchdownCard } = require('../src/app/ui/nfl-touchdown-card.tsx');
const { NFLReceivingCard } = require('../src/app/ui/nfl-receiving-card.tsx');
const td = require('../src/lib/nfl-touchdown-example.json');
const attempts = require('../src/lib/nfl-attempts-example.json');
const rushing = require('../src/lib/nfl-rushing-example.json');
const card = parseReceivingFeed(td, 'anytime-td').signals[0];
const now = Date.parse(td.generated_at);
const fresh = new Date(now + 600000).toISOString();
const expired = new Date(now - 1000).toISOString();
const render = (change = {}, options = {}) => renderToStaticMarkup(React.createElement(NFLTouchdownCard, { card: { ...card, ...change }, now, ...options }));

test('rushing accepts mixed attempts and yards while families remain isolated', () => {
  const feed = { ...rushing, signals: [...rushing.signals, ...attempts.signals] };
  assert.equal(parseReceivingFeed(feed, 'rushing').signals.length, 2);
  assert.throws(() => parseReceivingFeed(feed), /unexpected/);
  assert.throws(() => parseReceivingFeed(td, 'rushing'), /unexpected/);
  assert.throws(() => parseReceivingFeed(attempts, 'anytime-td'), /unexpected/);
});
test('attempts render count units and carry history without duplicate carries or extra volume adjustment', () => {
  const c = parseReceivingFeed(attempts, 'rushing').signals[0];
  const html = renderToStaticMarkup(React.createElement(NFLReceivingCard, { card: c, now, sample: true }));
  for (const text of ['Rushing attempts', '<small>att</small>', '>Attempts</th>', 'no additional volume adjustment']) assert.ok(html.includes(text), text);
  for (const text of ['>Carries</th>', 'Targets per game', 'Carry trend adjustment', 'Opponent adjustment', '<small>yds</small>']) assert.ok(!html.includes(text), text);
});
test('TD rendering uses YES/NO, probability units and genuine null binary thresholds', () => {
  assert.equal(card.market.books[0].line, null);
  assert.equal(card.signal.threshold, null);
  const html = render();
  for (const text of ['Anytime TD', '>YES</span>', '50%', '+16.67 pp', '33.33% implied', 'Not offered', 'Uncalibrated scoring frequency', 'Sample coverage', 'Passing touchdowns']) assert.ok(html.includes(text), text);
  for (const text of ['UNDER', 'OVER', '0.5', 'yds', 'Current consensus', 'win probability:']) assert.ok(!html.includes(text), text);
  assert.equal(displayTDSide(card.market.books[0], 'no', now).odds, null);
  assert.equal(tdComparison(card, 'no', now).probability, null);
});
test('TD parser normalizes decimal probabilities, rejects false binary lines and invalid outcomes', () => {
  const data = structuredClone(td);
  data.signals[0].projection.final = '0.5';
  data.signals[0].signal.book_probabilities.draftkings = '0.3333333333333333';
  assert.equal(parseReceivingFeed(data, 'anytime-td').signals[0].projection.final, 0.5);
  for (const mutate of [c => c.projection.final = 1.5, c => c.projection.conditional_on_playing = -0.1,
    c => c.market.books[0].line = 0, c => c.signal.threshold = 0.5, c => c.signal.direction = 'OVER',
    c => c.recent_games.games[0].value = 2, c => c.market.saved_comparison.sides.yes.implied_probability = 2]) {
    const invalid = structuredClone(td); mutate(invalid.signals[0]);
    assert.throws(() => parseReceivingFeed(invalid, 'anytime-td'), /unexpected/);
  }
});
test('conditional TD estimates and differences show without creating a signal or NO price', () => {
  const html = render({ available: false, projection: { ...card.projection, final: null, conditional_on_playing: '0.6' },
    availability: { status: 'unknown', freshness: 'missing' } });
  for (const text of ['If playing', '60%', '+26.67 pp', 'Signal on hold', 'Not offered']) assert.ok(html.includes(text), text);
  assert.ok(!html.includes('receiving-direction'));
});
test('TD history leaves unresolved outcomes unknown and preserves recorded YES/NO results', () => {
  const recent = structuredClone(card.recent_games);
  recent.games[0].value = recent.games[0].scored = recent.games[0].touchdowns = null;
  recent.games[1].props = [{ bookmaker: 'draftkings', bookmaker_name: 'DraftKings', line: null, result: 'NO' }];
  const parsed = parseReceivingFeed({ ...td, signals: [{ ...card, recent_games: recent }] }, 'anytime-td');
  const html = render({ recent_games: parsed.signals[0].recent_games });
  assert.ok(html.includes('Unresolved</td><td>—'));
  assert.ok(html.includes('NO<small>DraftKings</small>'));
});
test('TD signal freshness follows exact selected-side book probabilities', () => {
  assert.equal(tdSignalIsCurrent(card, card.signal, now), true);
  const changed = structuredClone(card);
  changed.market.books[0].yes_odds = 150;
  assert.equal(tdSignalIsCurrent(changed, changed.signal, now), false);
  const late = Date.parse(fresh) + 3600000;
  assert.equal(tdSignalIsCurrent(card, card.signal, late), false);
  assert.equal(tdSignalIsCurrent(card, card.signal, now, true), false);
  assert.ok(!render({}, { now: late }).includes('receiving-direction'));
  assert.ok(render({}, { now: late }).includes('Last saved'));
  const no = structuredClone(card);
  for (const b of no.market.books) { b.no_odds = 100; b.no_expires_at = fresh; b.yes_expires_at = expired; }
  no.signal = { ...no.signal, direction: 'NO', comparison_side: 'no', book_probabilities: { draftkings: 0.5, fanduel: 0.5 } };
  assert.equal(tdSignalIsCurrent(no, no.signal, now), true);
  no.market.books[0].no_expires_at = expired;
  assert.equal(tdSignalIsCurrent(no, no.signal, now), false);
});
test('withdrawn or invalid TD prices never revive and saved comparisons cannot authorize signals', () => {
  for (const status of ['withdrawn', 'invalid_timestamp']) {
    const changed = structuredClone(card);
    changed.market.books[0].latest_saved.yes.status = status;
    assert.equal(displayTDSide(changed.market.books[0], 'yes', now).odds, null);
    assert.equal(tdSignalIsCurrent(changed, changed.signal, now), false);
    assert.equal(tdComparison(changed, 'yes', now, true).probability, null);
  }
  const html = render({}, { outdated: true });
  assert.ok(html.includes('Saved implied'));
  assert.ok(html.includes('+16.67 pp'));
  assert.ok(!html.includes('receiving-direction'));
});
test('official and recorded TD signals keep their original probabilities and pp differences', () => {
  const frozen = { ...card.signal, projection: .7, edge: .2, implied_probability: .5 };
  const locked = render({ official_prediction: { signal: frozen, recorded_at: td.generated_at }, projection: { unit: 'probability', final: .3 }, late_availability_notice: { status: 'out', freshness: 'fresh' } }, { outdated: true });
  for (const text of ['Official · Locked', 'Frozen official prediction · YES', '70%', '+20 pp', '30%', 'Late injury update']) assert.ok(locked.includes(text), text);
  const historical = render({ last_recorded_signal: { status: 'historical', is_current: false, signal: frozen, recorded_at: td.generated_at, main_lines: {}, version: 'anytime-td-production-v1' } }, { outdated: true });
  assert.ok(historical.includes('Last recorded signal · YES'));
  assert.ok(historical.includes('Historical, not current or official'));
});
test('TD pagination uses its own endpoint and forwards cancellation', async () => {
  const original = global.fetch;
  const controller = new AbortController();
  const calls = [];
  try {
    global.fetch = async (url, options) => {
      calls.push(url); assert.equal(options.signal, controller.signal);
      return Response.json({ ...td, next_cursor: calls.length === 1 ? 'td+cursor' : null });
    };
    const feed = await loadReceivingFeed(controller.signal, 'anytime-td');
    assert.equal(feed.signals.length, 1);
    assert.equal(calls.length, 1);
    await loadReceivingFeed(controller.signal, 'anytime-td', { cursor: feed.next_cursor });
    assert.deepEqual(calls, ['/api/odds/nfl/anytime-td/?limit=20', '/api/odds/nfl/anytime-td/?limit=20&cursor=td%2Bcursor']);
  } finally { global.fetch = original; }
});
test('TD proxy stays on its backend path and whitelists pagination parameters', async () => {
  const { GET } = require('../src/app/api/odds/nfl/anytime-td/route.ts');
  const original = global.fetch; const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  process.env.NEXT_PUBLIC_API_BASE_URL = 'https://example.test';
  try {
    global.fetch = async (url, options) => {
      assert.equal(url, 'https://example.test/api/odds/nfl/anytime-td/?limit=100&cursor=td');
      assert.equal(options.cache, 'no-store'); return Response.json(td);
    };
    const response = await GET(new Request('http://localhost/api/odds/nfl/anytime-td/?limit=100&cursor=td&url=ignored'));
    assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'no-store');
  } finally { global.fetch = original; if (base === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL; else process.env.NEXT_PUBLIC_API_BASE_URL = base; }
});
test('new prop tabs follow receiving and rushing yards', () => {
  const { NFLReceivingDashboard } = require('../src/app/ui/nfl-receiving-dashboard.tsx');
  const html = renderToStaticMarkup(React.createElement(NFLReceivingDashboard));
  assert.ok(html.indexOf('Rushing yards') < html.indexOf('Rushing attempts'));
  assert.ok(html.indexOf('Rushing attempts') < html.indexOf('Anytime TD'));
});

test('TD cards without an input capture or official prediction remain valid unavailable cards', () => {
  const missing = { ...card, available: false, projection: {}, recent_games: { games: [] },
    signal: { direction: 'PASS', status: 'unavailable', confidence: 0, reasons: [{ code: 'no_official_prediction', text: 'No official prediction was recorded.' }] },
    live_signal: null, display: { state: 'closed', label: 'Prediction window closed' } };
  const feed = parseReceivingFeed({ ...td, signals: [missing] }, 'anytime-td');
  const html = render(feed.signals[0]);
  assert.ok(html.includes('Prediction window closed'));
  assert.ok(html.includes('Latest research scoring estimate</span><strong>—'));
  assert.ok(!html.includes('receiving-direction'));
});

test('recorded touchdown counts provide a lower-bound fallback without resolving unknown outcomes', () => {
  for (const [touchdowns, recorded, expected] of [[null, '2', '2+ TDs'], [null, 1, '1+ TDs'], [null, 0, '—'], [null, null, '—'], [null, undefined, '—'], [0, 2, '0'], [3, 2, '3']]) {
    const game = { ...card.recent_games.games[0], value: null, scored: null, touchdowns, recorded_touchdowns: recorded, props: [] };
    const data = { ...td, signals: [{ ...card, recent_games: { ...card.recent_games, games: [game] } }] };
    const parsed = parseReceivingFeed(data, 'anytime-td').signals[0];
    const html = render(parsed);
    assert.ok(html.includes(`Unresolved</td><td>${expected}</td>`), expected);
    assert.equal(html.includes('may be incomplete'), expected.includes('+'));
    if (recorded === '2') assert.equal(parsed.recent_games.games[0].recorded_touchdowns, 2);
  }
});
test('invalid recorded touchdown counts are rejected', () => {
  for (const recorded_touchdowns of [-1, 1.5, 'invalid', true]) {
    const data = structuredClone(td);
    data.signals[0].recent_games.games[0].recorded_touchdowns = recorded_touchdowns;
    assert.throws(() => parseReceivingFeed(data, 'anytime-td'), /unexpected/);
  }
});
