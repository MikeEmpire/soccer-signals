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
const { parseReceivingFeed, numberLabel, loadReceivingFeed, marketIsCurrent } = require('../src/lib/nfl-receiving.ts');
const example = require('../src/lib/nfl-receiving-example.json');
const card = example.signals.find(s => s.prop === 'receiving_yards');
const now = Date.parse(example.generated_at);
const render = (change = {}, options = {}) => renderToStaticMarkup(React.createElement(NFLReceivingCard, { card: { ...card, ...change }, now, sample: true, ...options }));

test('sample is a valid generated feed and card shows backend projection evidence', () => {
  assert.equal(parseReceivingFeed(example).window_hours, 72);
  assert.equal(parseReceivingFeed({ ...example, window_hours: 48 }).window_hours, 48);
  assert.throws(() => parseReceivingFeed({ ...example, window_hours: 999 }), /unexpected response/);
  const html = render();
  for (const text of ['Example Receiver', 'Receiving yards', '62.75', '56.5', '+6.25', '+12.25', 'DraftKings', 'FanDuel', 'Bovada', 'How this projection was built', 'Pregame history']) assert.ok(html.includes(text), text);
  assert.ok(!html.includes('Caesars'));
});
test('one book does not display consensus; missing projection is not zero', () => {
  const html = render({ available: false, reason: 'no_pre_kickoff_input_capture', projection: {}, market: { ...card.market, books_available: 1, median_line: null }, edge_vs_median: null });
  assert.ok(html.includes('1/3 books'));
  assert.ok(html.includes('Multi-book consensus and disagreement are unavailable'));
  assert.ok(html.includes('Waiting for pregame research data'));
  assert.ok(!html.includes('62.75'));
  assert.equal(numberLabel(null), '—');
  assert.equal(numberLabel(0), '0');
});
test('expired data and failed refresh hide market comparisons but retain projection', () => {
  for (const options of [{ sample: false, now: now+86400000 }, { sample: false, outdated: true }]) {
    const html = render({}, options);
    assert.ok(html.includes('62.75'));
    assert.ok(html.includes('0/3 books'));
    assert.ok(!html.includes('+12.25'));
    assert.ok(!html.includes('40.5'));
  }
  assert.equal(marketIsCurrent({ ...card, market: { ...card.market, expires_at: new Date(now+1000).toISOString() } }, now), true);
  assert.equal(marketIsCurrent({ ...card, market: { ...card.market, expires_at: new Date(now).toISOString() } }, now), false);
});
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
      assert.equal(url, '/api/odds/nfl/receiving/');
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
    assert.equal((await GET(new Request('http://localhost/api/odds/nfl/receiving/'))).status, 502);
  } finally { global.fetch = original; if (base === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL; else process.env.NEXT_PUBLIC_API_BASE_URL = base; }
});
