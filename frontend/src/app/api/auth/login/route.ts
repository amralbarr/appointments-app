import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { backendFetch } from "@/lib/backend";
import { SESSION_COOKIE, decodeSession, sessionCookieMaxAge } from "@/lib/session";

// Calls the real backend POST /auth/login and, on success, sets our own
// httpOnly session cookie from the returned accessToken — the browser
// never sees the token itself, only this route and the BFF proxies do.
// The backend also sets a refresh-token cookie scoped to its own
// /api/v1/auth path; this server-to-server fetch doesn't forward that
// anywhere (the frontend has no refresh route to use it with yet) — a
// real, open limitation, not an oversight: a session here lasts exactly
// as long as the backend's own 15-minute access token, then the user logs
// in again. See frontend/README.md.
export async function POST(request: Request) {
  const dto = await request.json();

  const res = await backendFetch("auth/login", { method: "POST", body: dto });
  const body = await res.json().catch(() => null);

  if (!res.ok) {
    return NextResponse.json(body ?? { message: "Login failed." }, { status: res.status });
  }

  const accessToken = body?.accessToken as string | undefined;
  if (!accessToken) {
    return NextResponse.json({ message: "Backend did not return an access token." }, { status: 502 });
  }

  const claims = decodeSession(accessToken);
  const jar = await cookies();
  // `secure` gated on NODE_ENV alone would silently drop the flag in a
  // production deployment where
  // NODE_ENV isn't reliably "production" at runtime, even though the
  // real request arrived over TLS behind a reverse proxy. Trust the
  // actual connection too: a request fronted by nginx/pm2's own setup
  // (MONOREPO-AND-DEPLOYMENT.md) sets x-forwarded-proto, same as every
  // standard reverse-proxy convention.
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const isHttps = forwardedProto === "https" || process.env.NODE_ENV === "production";
  jar.set(SESSION_COOKIE, accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps,
    path: "/",
    maxAge: sessionCookieMaxAge(accessToken),
  });

  return NextResponse.json({ role: claims?.role ?? "OWNER" });
}
