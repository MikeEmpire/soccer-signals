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
