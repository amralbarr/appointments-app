import { NextResponse } from "next/server";
import { backendFetch, isSafePathSegment } from "@/lib/backend";

// Thin, unauthenticated proxies to the real GET/DELETE /bookings/:bookingId
// — both gated by a ?cancelToken= match on the backend, never a login
// (backend/docs/API.md). DELETE lets a customer cancel their own booking
// through the UI with the token it just displayed.
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/public/bookings/[bookingId]">,
) {
  const { bookingId } = await ctx.params;
  // See api/public/platforms/[slug]/route.ts for why every path segment
  // used this way needs this same validation.
  if (!isSafePathSegment(bookingId)) {
    return NextResponse.json({ message: "Invalid bookingId." }, { status: 400 });
  }
  const { searchParams } = new URL(request.url);
  const res = await backendFetch(`bookings/${bookingId}`, { searchParams });
  const body = await res.json();
  return NextResponse.json(body, { status: res.status });
}

export async function DELETE(
  request: Request,
  ctx: RouteContext<"/api/public/bookings/[bookingId]">,
) {
  const { bookingId } = await ctx.params;
  if (!isSafePathSegment(bookingId)) {
    return NextResponse.json({ message: "Invalid bookingId." }, { status: 400 });
  }
  const { searchParams } = new URL(request.url);
  const res = await backendFetch(`bookings/${bookingId}`, { method: "DELETE", searchParams });
  if (res.status === 204) return new NextResponse(null, { status: 204 });
  const body = await res.json();
  return NextResponse.json(body, { status: res.status });
}
