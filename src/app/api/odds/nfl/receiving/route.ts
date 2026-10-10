export async function GET(request: Request) {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");
  const headers = { "Cache-Control": "no-store" };
  if (!base) return Response.json({ detail: "The NFL service is not configured." }, { status: 503, headers });
  try {
    const params = new URLSearchParams();
    const incoming = new URL(request.url).searchParams;
    for (const key of ["limit", "cursor", "prop"]) {
      const value = incoming.get(key);
      if (value !== null) params.set(key, value);
    }
    const query = params.size ? `?${params}` : "";
    const upstream = await fetch(`${base}/api/odds/nfl/receiving/${query}`, {
      cache: "no-store", headers: { Accept: "application/json" },
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(15000)]),
    });
    if (!upstream.ok) return Response.json({ detail: "The NFL service is unavailable." }, { status: upstream.status === 400 ? 400 : upstream.status === 503 ? 503 : 502, headers });
    return Response.json(await upstream.json(), { headers });
  } catch {
    return Response.json({ detail: "The NFL service is unavailable." }, { status: 502, headers });
  }
}
