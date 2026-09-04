import { ODDS_LEAGUES } from "../../../../lib/odds";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const league = ODDS_LEAGUES.find((item) => item.sport === params.get("sport") && item.league === params.get("league"));
  if (!league) return Response.json({ detail: "Unsupported sport or league." }, { status: 400 });
  if (!API_BASE_URL) return Response.json({ detail: "NEXT_PUBLIC_API_BASE_URL is not configured." }, { status: 500 });
  try {
    const query = new URLSearchParams({ sport: league.sport, league: league.league });
    const upstream = await fetch(`${API_BASE_URL}/api/odds/pregame/?${query}`, {
      cache: "no-store", headers: { Accept: "application/json" }, signal: request.signal,
    });
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("Content-Type") ?? "application/json" },
    });
  } catch {
    return Response.json({ detail: "The odds service is unavailable." }, { status: 502 });
  }
}
