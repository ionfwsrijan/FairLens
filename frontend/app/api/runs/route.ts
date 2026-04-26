const BACKEND_URL =
  process.env.FAIRLENS_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function GET() {
  const response = await fetch(new URL("/api/runs", BACKEND_URL), { cache: "no-store" });
  return new Response(await response.text(), {
    status: response.status,
    headers: { "content-type": response.headers.get("content-type") ?? "application/json" }
  });
}
