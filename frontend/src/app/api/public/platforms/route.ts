import { NextResponse } from "next/server";
import { backendFetch } from "@/lib/backend";

// Thin, unauthenticated proxy to the real GET /platforms/public — the
// `/list` page's data source. No cookie, no Authorization header: this is
// exactly as public on this side as it is on the backend's.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const res = await backendFetch("platforms/public", { searchParams });
  const body = await res.json();
  return NextResponse.json(body, { status: res.status });
}
