import { NextResponse } from "next/server";
import { backendFetch, isSafePathSegment } from "@/lib/backend";

// Proxies to the real, already-shipped in-process AI booking assistant —
// POST /platforms/:platformId/chat. Public, no login,
// same 10/min/ip throttle tier as booking writes on the backend side; this
// route adds no auth of its own since the backend route has none either.
// See docs/AI-BOOKING-ASSISTANT.md.
export async function POST(request: Request) {
  let dto: Record<string, unknown> | null;
  try {
    dto = await request.json();
  } catch {
    return NextResponse.json({ message: "Request body must be valid JSON." }, { status: 400 });
  }
  const { platformId, customerEmail, message } = dto ?? {};

  // platformId arrives in the body here (not a URL segment), but it's
  // still concatenated straight into a backend path string below - the
  // same validation applies (see api/public/platforms/[slug]/route.ts):
  // validate before it's ever joined into a path.
  if (typeof platformId !== "string" || !isSafePathSegment(platformId)) {
    return NextResponse.json({ message: "platformId is required." }, { status: 400 });
  }

  const res = await backendFetch(`platforms/${platformId}/chat`, {
    method: "POST",
    body: { customerEmail, message },
  });
  const body = await res.json().catch(() => null);
  return NextResponse.json(body, { status: res.status });
}
