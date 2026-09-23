import { ODDS_LEAGUES } from "../../../../lib/odds";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const leagueParam = params.get("league");
  const monthParam = params.get("month"); // YYYY-MM

  const supported = ODDS_LEAGUES.map((l) => l.league);
  if (!leagueParam || !supported.includes(leagueParam as typeof supported[number])) {
    return Response.json({ detail: "Unsupported league." }, { status: 400 });
  }
  if (!monthParam || !/^\d{4}-\d{2}$/.test(monthParam)) {
    return Response.json({ detail: "month must be YYYY-MM." }, { status: 400 });
  }
  if (!API_BASE_URL) {
    return Response.json({ detail: "NEXT_PUBLIC_API_BASE_URL is not configured." }, { status: 500 });
  }
  try {
    const upstream = await fetch(`${API_BASE_URL}/api/odds/calendar/?${params}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: request.signal,
    });
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("Content-Type") ?? "application/json" },
    });
  } catch {
    return Response.json({ detail: "The odds service is unavailable." }, { status: 502 });
  }
}
