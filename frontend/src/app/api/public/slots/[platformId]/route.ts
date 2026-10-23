import { NextResponse } from "next/server";
import { backendFetch, isSafePathSegment } from "@/lib/backend";

// Thin, unauthenticated proxy to the real GET /platforms/:platformId/slots
// — availability is a public read on the backend (backend/docs/API.md:
// "a would-be customer needs to see availability before they have any
// credential at all"), so this proxy needs none either. Used by the
// `/[slug]` page's live slot picker, both on first render and on every
// socket-driven refetch.
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/public/slots/[platformId]">,
) {
  const { platformId } = await ctx.params;
  // See api/public/platforms/[slug]/route.ts for why every path segment
  // used this way needs this same validation.
  if (!isSafePathSegment(platformId)) {
    return NextResponse.json({ message: "Invalid platformId." }, { status: 400 });
  }
  const { searchParams } = new URL(request.url);
  // forced, not just the client's own default - this route is only ever
  // the public customer-facing picker's own proxy (the owner dashboard's
  // slot management goes through a separate BFF route entirely and needs
  // to see every real seat row, never deduped). A platform with multiple
  // seats at the same time+service should read as one bookable option
  // here, not one card per chair.
  searchParams.set('dedupe', 'true');
  const res = await backendFetch(`platforms/${platformId}/slots`, { searchParams });
  const body = await res.json();
  return NextResponse.json(body, { status: res.status });
}
