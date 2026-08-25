const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");

export async function GET() {
  if (!API_BASE_URL) {
    return Response.json(
      { detail: "NEXT_PUBLIC_API_BASE_URL is not configured." },
      { status: 500 },
    );
  }

  try {
    const upstream = await fetch(`${API_BASE_URL}/api/soccer/odds/pregame/`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const body = await upstream.text();

    return new Response(body, {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("Content-Type") ?? "application/json" },
    });
  } catch {
    return Response.json({ detail: "The odds service is unavailable." }, { status: 502 });
  }
}
