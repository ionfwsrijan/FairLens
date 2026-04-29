import { NextRequest } from "next/server";

const BACKEND_URL =
  process.env.FAIRLENS_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function proxyWarmup(request: NextRequest, method: "GET" | "POST") {
  const incoming = new URL(request.url);
  const upstream = new URL("/api/warmup", BACKEND_URL);

  incoming.searchParams.forEach((value, key) => {
    upstream.searchParams.set(key, value);
  });

  const response = await fetch(upstream, { method, cache: "no-store" });
  const body = await response.text();

  return new Response(body, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json"
    }
  });
}

export async function GET(request: NextRequest) {
  return proxyWarmup(request, "GET");
}

export async function POST(request: NextRequest) {
  return proxyWarmup(request, "POST");
}
