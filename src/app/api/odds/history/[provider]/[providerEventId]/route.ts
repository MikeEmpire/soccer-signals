import { ODDS_LEAGUES } from "../../../../../../lib/odds";

export async function GET(request: Request, context: { params: Promise<{ provider: string; providerEventId: string }> }) {
  const params = new URL(request.url).searchParams;
  const league = ODDS_LEAGUES.find(item => item.sport === params.get("sport") && item.league === params.get("league"));
  const { provider, providerEventId } = await context.params;
  if (!league || !/^[a-zA-Z0-9_-]+$/.test(provider) || !/^[a-zA-Z0-9_-]+$/.test(providerEventId)) return Response.json({ detail: "Unsupported sport, league, or event identifier." }, { status: 400 });
  const base = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");
  if (!base) return Response.json({ detail: "NEXT_PUBLIC_API_BASE_URL is not configured." }, { status: 500 });
  try {
    const query = new URLSearchParams({ sport: league.sport, league: league.league });
    const upstream = await fetch(`${base}/api/odds/history/${encodeURIComponent(provider)}/${encodeURIComponent(providerEventId)}/?${query}`, { cache: "no-store", headers: { Accept: "application/json" }, signal: request.signal });
    return new Response(upstream.status === 204 ? null : await upstream.text(), { status: upstream.status, headers: { "Content-Type": upstream.headers.get("Content-Type") ?? "application/json" } });
  } catch {
    return Response.json({ detail: "The odds history service is unavailable." }, { status: 502 });
  }
}
