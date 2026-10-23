import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { backendFetch, isSafePathSegment } from "@/lib/backend";
import { SESSION_COOKIE, getValidSession } from "@/lib/session";

// Shared plumbing behind both authenticated BFF proxies
// (app/api/dashboard/[...path] and app/api/admin/[...path]). Sharing this
// much is just HTTP forwarding, not the "if (isAdmin)" branch
// FRONTEND-ARCHITECTURE.md's "two separate routes" reasoning is actually
// about — each route file still only ever reaches the one backend prefix
// it's hardcoded to call below, so a tenant's cookie forwarded through
// `/api/dashboard/*` has no code path to `/admin/*`, and vice versa.
export async function proxyToBackend(
  request: Request,
  pathSegments: string[],
  backendPrefix: string,
): Promise<NextResponse> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  // getValidSession, not a bare truthiness check - a malformed/expired
  // cookie value is treated as logged
  // out here too, not just at the layout-guard level. This alone doesn't
  // make the backend's own verification redundant (it's still the real,
  // signature-checked authority on every forwarded request) - it's
  // defense in depth, closing the gap where this proxy would otherwise
  // forward literally any non-empty cookie value as a bearer token.
  if (!getValidSession(token)) {
    return NextResponse.json({ message: "Not logged in." }, { status: 401 });
  }

  // Every segment must be validated BEFORE it's
  // joined into a path string - `new URL()` normalizes `..`/`.` across
  // the whole string, including the fixed /api/v1 prefix baked into
  // BACKEND_INTERNAL_URL, so an unvalidated segment could escape the
  // guarded backend namespace entirely (confirmed: reached the backend's
  // own unauthenticated /docs). backendFetch() also asserts this as a
  // second, independent gate - this check is the one that returns a
  // clean 400 instead of the Error that second gate throws.
  if (!pathSegments.every(isSafePathSegment)) {
    return NextResponse.json({ message: "Invalid path." }, { status: 400 });
  }

  const backendPath = [backendPrefix, ...pathSegments].filter(Boolean).join("/");
  const incomingUrl = new URL(request.url);

  let body: unknown;
  if (!["GET", "HEAD", "DELETE"].includes(request.method)) {
    const text = await request.text();
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      // a malformed/non-JSON body used to throw uncaught here - a clean
      // 400 instead, same as a real validation failure, never a raw
      // stack trace to the client.
      return NextResponse.json({ message: "Request body must be valid JSON." }, { status: 400 });
    }
  }

  const res = await backendFetch(backendPath, {
    method: request.method,
    accessToken: token,
    body,
    searchParams: incomingUrl.searchParams,
  });

  if (res.status === 204) return new NextResponse(null, { status: 204 });

  const text = await res.text();
  const payload = text ? JSON.parse(text) : null;
  return NextResponse.json(payload, { status: res.status });
}
