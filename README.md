Sports Signals is a responsive pregame odds dashboard for Premier League, La Liga, Champions League, NFL, and MLB.

The main dashboard requests `/api/odds/pregame/?sport=…&league=…`, proxied to the existing `NEXT_PUBLIC_API_BASE_URL`. Each response supplies the complete feed window; events are grouped by local start date. League selection is stored in the URL and session storage. Refreshes run every 5 minutes while the page is visible, with a refresh button and pull-to-refresh on touch devices.

Each sports card pairs Opening and Current moneylines and loads Odds history only when expanded. History uses `/api/odds/history/[provider]/[providerEventId]/?sport=…&league=…`, proxied to the generic backend history endpoint. Its in-memory event cache revalidates after five minutes while expanded and visible, shares active requests, and cancels them when the last subscriber leaves. Failed refreshes retain the last successful history with an outdated warning and retry action.

Opening prices use only `odds.open_home_ml`, `odds.open_draw_ml`, and `odds.open_away_ml`. Live payloads inspected on September 8, 2026 omit these fields; the adjacent backend's `_snapshot_dict` also omits the stored opening fields. The backend must expose them before actual opening prices can appear for all sports. Missing prices display “—”; neither history nor signal context is used as an opening-price fallback. No backend code or signal rules were changed.

The generic history endpoint currently filters to DraftKings (sportsbook ID `100`). Rows are deduplicated and sorted by capture time, sportsbook, then snapshot ID. Simultaneous captures are displayed deterministically without inferring their movement order; movement after an ambiguous preceding capture is also withheld. Supplied line phases describe each capture, not necessarily the latest snapshot. American-odds sign crossings are explicitly labeled, and zero/nonstandard prices remain displayable without invented movement.

The original soccer dashboard remains at `/soccer`, using the unchanged `/api/pregame` and `/api/history/[espnEventId]` contracts. Signal trigger fields are available in every build; raw context JSON is development-only.

Run `npm test` for feed, card-rendering, proxy, and request cancellation tests, `npm run lint` for lint, and `npm run build` for production validation. In environments that block Turbopack's local worker port, use `npm run build -- --webpack`.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

The main screen is `src/app/ui/dashboard.tsx`, event cards are in `src/app/ui/odds-event-card.tsx`, and response types and feed utilities are in `src/lib/odds.ts`.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Soccer signal tiers

The main dashboard and `/soccer` render the backend `signals` array in its supplied order.
Primary, alternate, and secondary badges use `tier`; titles prefer `label` and soccer
explanations prefer `description`. Older payloads without metadata retain existing labels.
All simultaneous signals remain visible, including opposing team predictions. Match goals
signals explicitly display **match total over 1.5 goals** and all qualifying team prices.
Draw history distinguishes returned prices, no recorded departure, and unavailable history.
Movement evidence shows the saved opening role, prices, direction, and continuous American
points supplied by the backend; the frontend does not evaluate thresholds or infer probability.
Soccer odds history preserves and displays each snapshot's own signals, never today's signals.
The existing raw moneyline history delta remains a separate quote comparison, not the
opening-to-current signal movement measure. NFL and MLB displays retain their behavior.

## NFL receiving research V1

Open `/nfl` (the **NFL Props** navigation tab). **Live** reads the next rolling
72 hours from `/api/odds/nfl/receiving/`, proxied to the same path on
`NEXT_PUBLIC_API_BASE_URL`. Receiving yards and receptions cards display the
backend projection, DraftKings/FanDuel/Bovada lines and matched over/under prices,
a compact eligible signal or neutral backend status, and recent performances.
Cards show five recent games with expansion to ten, including cross-season and
playoff history. Each historical line uses DraftKings, then FanDuel, then Bovada
when available, with the book named and the backend OVER/UNDER/PUSH result.
Missing past props and actuals stay unavailable; current lines are never used
as substitutes. The signal badge, projection-versus-consensus comparison and backend reasons lead
the card. Current book prices and per-book differences remain visible above
recent performances. Projection calculations are collapsed by default. No projections or consensus are computed in the
browser. These are research estimates, not betting recommendations.

**Sample preview** is an explicit opt-in, clearly labeled fixed synthetic dataset
based on backend test data with illustrative recent games. It works without a populated backend and never
replaces a failed or empty live response automatically. The fixture is in
`src/lib/nfl-receiving-example.json` and contains an illustrative matchup and
Example Receiver, not a real-player forecast.

Live data requires the backend odds migrations, upcoming persisted ESPN games,
verified receiving markets and pregame input captures. The client refreshes
once per minute while visible and on returning to the tab; refreshing does not
collect provider data. Expired quotes and failed refreshes suppress live comparisons while retaining
explicitly labeled last-saved prices. Games without markets, missing captures and transport errors have
separate visible states. With only one book, median/disagreement remain absent.

The production V1 client follows every cursor before replacing the displayed slate,
deduplicates cards, and restarts once on an expired cursor. Prices become last-saved per book
and side on expiry. Consensus expiry suppresses the live comparison and requests a refresh;
official predictions retain their frozen line, projection, edge and confidence.
OVER/UNDER/PASS and unavailable reasons come directly from the backend. Confidence
is an evidence score, never a win probability. The projection tooltip identifies evidence time separately from response time. Legacy threshold frequency tables and projection diagnostics are omitted.

Historical grades, aggregates and CLV remain in the linked backend staff research
dashboard at `/admin/odds/nflreceivingofficial/research/`. Authenticate there with
an existing staff account; no staff credentials are placed in the frontend.

To test locally, configure `NEXT_PUBLIC_API_BASE_URL` for the backend, run
`npm run dev`, and open `http://localhost:3000/nfl`. Use **Sample preview** for a
backend-independent UI check, or **Live** for the complete production slate.
Run `node --test tests/nfl-receiving.test.cjs` for contract and rendering checks.
Existing repo-wide lint findings in review/calendar/odds and the older test's
missing Nations League expectation predate this change.

The simplified cards consume additive `recent_games` and `display` fields. Older
responses show a neutral history-unavailable message. Deploy the updated backend
and refresh capture frames to populate cross-season/playoff history; old frames
retain their original scope. Past props depend on already recorded pregame main
lines and cannot be reconstructed for games before collection began.

Latest saved sportsbook prices use each side's `latest_saved` DTO. Fresh main
values take precedence; stale prices retain their own threshold, American odds,
and quote age. Over and under thresholds are displayed separately. Withdrawals
and invalid timestamps display no price, and a missing side says “No line
recorded.” A failed request demotes retained quotes to last-saved without changing
any official prediction. Fresh coverage, consensus and live edges never use saved
prices. The latest-saved backend deployment is needed to expose stale prices that
are absent from the older DTO; polling this UI only reads stored data.

Saved comparisons use the backend's `market.saved_comparison` when a fresh
consensus is unavailable, including its projection and difference. The age label
uses the oldest included quote; details list the exact books and quote times.
Per-book saved differences are labeled separately and only accompany their
matching saved OVER threshold. No consensus or difference is computed locally.

When a current eligible signal (including PASS) is unavailable, a muted
`last_recorded_signal` can show the original threshold, projection, reasons and
model version. It is always historical, never current or official, regardless of
quote expiry. After lock only the official prediction applies; a missing official
is never replaced with a historical record. These fields require the saved-context
backend deployment; older responses continue without a fabricated fallback.
