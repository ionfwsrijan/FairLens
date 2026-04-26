import { NextRequest } from "next/server";

const BACKEND_URL =
  process.env.FAIRLENS_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function GET() {
  const response = await fetch(new URL("/api/reviews", BACKEND_URL), { cache: "no-store" });
  return new Response(await response.text(), {
    status: response.status,
    headers: { "content-type": response.headers.get("content-type") ?? "application/json" }
  });
}

export async function POST(request: NextRequest) {
  const response = await fetch(new URL("/api/reviews", BACKEND_URL), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: await request.text()
  });
  return new Response(await response.text(), {
    status: response.status,
    headers: { "content-type": response.headers.get("content-type") ?? "application/json" }
  });
}
