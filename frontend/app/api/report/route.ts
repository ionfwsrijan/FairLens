import { NextRequest } from "next/server";

const BACKEND_URL =
  process.env.FAIRLENS_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function GET(request: NextRequest) {
  const incoming = new URL(request.url);
  const upstream = new URL("/api/report", BACKEND_URL);
  incoming.searchParams.forEach((value, key) => upstream.searchParams.set(key, value));

  const response = await fetch(upstream, { cache: "no-store" });
  return new Response(await response.text(), {
    status: response.status,
    headers: { "content-type": response.headers.get("content-type") ?? "application/json" }
  });
}
