import { redirect } from "@/i18n/navigation";

// The frontend's own session cookie: carries the real backend access token
// verbatim (sub/scopes/role all ride in its claims already — see
// backend/src/auth/auth.service.ts issueTokenPair()). httpOnly, set only by
// /api/auth/login's route handler, read by every BFF proxy and by each
// route group's layout guard.
//
// Decoding here never verifies the signature — there's no JWT secret on
// this side, deliberately (CODING_STANDARDS/REPO-CONVENTIONS: don't
// introduce a secret this service doesn't need). That's fine: this decode
// only drives which page a layout renders/redirects to. The actual
// authorization boundary is the backend's own AuthGuard/AdminGuard, which
// verifies the real signature on every single data request the BFF proxies
// forward — a tampered or expired cookie still can't retrieve real data,
// it would just make the layout guess wrong about what to *show*, and the
// backend would then 401/403 the very next request anyway.
export const SESSION_COOKIE = "session";

export interface SessionClaims {
  sub: string;
  scopes: string[];
  role?: "OWNER" | "ADMIN";
  exp?: number;
}

export function decodeSession(token: string): SessionClaims | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const json = Buffer.from(payload, "base64url").toString("utf8");
    return JSON.parse(json) as SessionClaims;
  } catch {
    return null;
  }
}

export function sessionCookieMaxAge(token: string): number {
  const claims = decodeSession(token);
  if (!claims?.exp) return 15 * 60; // same default as JWT_ACCESS_TTL
  const secondsLeft = claims.exp - Math.floor(Date.now() / 1000);
  return secondsLeft > 0 ? secondsLeft : 0;
}

// Used by each route group's layout guard — null for "treat as logged
// out", whether that's no cookie, a malformed token, or one that's expired
// (decodeSession alone doesn't check exp; a redirect-only consumer needs
// to, even though the real rejection still happens at the backend too).
export function getValidSession(token: string | undefined): SessionClaims | null {
  if (!token) return null;
  const claims = decodeSession(token);
  if (!claims) return null;
  if (claims.exp && claims.exp * 1000 < Date.now()) return null;
  return claims;
}

// Used by every (dashboard)/(admin) Server Component page to get the raw
// token to forward as a real Authorization header. Every such page
// already sits behind its route group's own layout guard, which would
// have redirected before this ever runs without a valid session — but
// relying on that ordering alone via a bare
// `jar.get(SESSION_COOKIE)!.value` non-null assertion isn't worth the
// risk; a defense-in-depth check on the highest-stakes pages, not just
// the layout. getValidSession() here re-checks (not just presence, expiry
// too) and redirects again if it somehow wasn't already caught — the
// real authorization boundary is still the backend on every forwarded
// request either way, same as always. redirect() throws, so callers can
// treat this as "always returns a usable token."
export function requireSessionToken(token: string | undefined, locale: string): string {
  if (!getValidSession(token)) {
    redirect({ href: "/login", locale });
  }
  return token as string;
}
