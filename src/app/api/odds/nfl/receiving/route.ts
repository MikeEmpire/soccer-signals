export async function GET(request: Request) {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");
  const headers = { "Cache-Control": "no-store" };
  if (!base) return Response.json({ detail: "The NFL service is not configured." }, { status: 503, headers });
  try {
    const upstream = await fetch(`${base}/api/odds/nfl/receiving/`, {
      cache: "no-store", headers: { Accept: "application/json" },
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(15000)]),
    });
    if (!upstream.ok) return Response.json({ detail: "The NFL service is unavailable." }, { status: 502, headers });
    return Response.json(await upstream.json(), { headers });
  } catch {
    return Response.json({ detail: "The NFL service is unavailable." }, { status: 502, headers });
  }
}
