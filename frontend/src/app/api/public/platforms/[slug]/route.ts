import { NextResponse } from "next/server";
import { backendFetch, isSafePathSegment } from "@/lib/backend";

// Thin, unauthenticated proxy to the real GET /platforms/public/:slug —
// the `/[slug]` page's data source.
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/public/platforms/[slug]">,
) {
  const { slug } = await ctx.params;
  // Path-traversal via an unvalidated segment escaping the backend's
  // /api/v1 prefix is a real risk here, same as every dynamic segment
  // this app forwards, not just the authenticated proxies —
  // `encodeURIComponent` alone doesn't stop a literal ".." segment value
  // (dots aren't escaped by it). A real slug never contains anything
  // outside this set anyway (slugify + a hex suffix).
  if (!isSafePathSegment(slug)) {
    return NextResponse.json({ message: "Invalid slug." }, { status: 400 });
  }
  const res = await backendFetch(`platforms/public/${slug}`);
  const body = await res.json();
  return NextResponse.json(body, { status: res.status });
}
