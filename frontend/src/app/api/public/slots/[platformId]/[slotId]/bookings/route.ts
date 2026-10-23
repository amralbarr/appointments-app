import { NextResponse } from "next/server";
import { backendFetch, isSafePathSegment } from "@/lib/backend";

// Thin, unauthenticated proxy to the real
// POST /platforms/:platformId/slots/:slotId/bookings — the one write a
// customer makes directly, no account needed (backend/docs/API.md). The
// manual booking form posts here.
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/public/slots/[platformId]/[slotId]/bookings">,
) {
  const { platformId, slotId } = await ctx.params;
  // See api/public/platforms/[slug]/route.ts for why every path segment
  // used this way needs this same validation.
  if (!isSafePathSegment(platformId) || !isSafePathSegment(slotId)) {
    return NextResponse.json({ message: "Invalid path." }, { status: 400 });
  }
  let dto: unknown;
  try {
    dto = await request.json();
  } catch {
    return NextResponse.json({ message: "Request body must be valid JSON." }, { status: 400 });
  }
  const res = await backendFetch(`platforms/${platformId}/slots/${slotId}/bookings`, {
    method: "POST",
    body: dto,
  });
  const body = await res.json();
  return NextResponse.json(body, { status: res.status });
}
