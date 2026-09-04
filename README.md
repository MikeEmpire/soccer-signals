Sports Signals is a responsive pregame odds dashboard for Premier League, La Liga, Champions League, NFL, and MLB.

The main dashboard requests `/api/odds/pregame/?sport=…&league=…`, proxied to the existing `NEXT_PUBLIC_API_BASE_URL`. Each response supplies the complete feed window; events are grouped by local start date. League selection is stored in the URL and session storage. Refreshes run every 60 seconds, with a refresh button and pull-to-refresh on touch devices.

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
