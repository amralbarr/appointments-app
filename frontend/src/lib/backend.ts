// Thin wrapper around the real backend, called only from server-side code
// (route handlers / server components) — the browser never talks to the
// backend directly, see docs/FRONTEND-ARCHITECTURE.md "The BFF pattern".
const BACKEND_INTERNAL_URL =
  process.env.BACKEND_INTERNAL_URL ?? "http://localhost:3000/api/v1";

// The fixed origin+prefix every real backend call must stay under. Used
// below as a final gate, independent of whatever path string a caller
// built — see "segment safety" note on backendFetch.
const BACKEND_ORIGIN = new URL(BACKEND_INTERNAL_URL).origin;
const BACKEND_PREFIX_PATH = new URL(BACKEND_INTERNAL_URL).pathname.replace(/\/$/, "");

export class BackendError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(
      typeof body === "object" && body && "message" in body
        ? String((body as { message: unknown }).message)
        : `Backend responded ${status}`,
    );
  }
}

// `new URL()` normalizes `..`/`.` segments across the ENTIRE constructed
// string, including this
// module's own fixed `/api/v1` prefix — a caller that forwards an
// attacker-controlled path segment (any BFF catch-all proxy) could escape
// the prefix entirely and reach whatever else the backend process exposes
// outside its guarded, Nest-routed namespace (confirmed: backend's own
// unauthenticated /docs). Every proxy route must validate each path
// segment with this before it ever reaches backendFetch - alphanumeric/
// hyphen/underscore only, which is already every real segment this app
// ever forwards (a uuid, a literal route word like "services"), so this
// is not a functional restriction, just closing the escape hatch.
const SAFE_PATH_SEGMENT = /^[A-Za-z0-9_-]+$/;

export function isSafePathSegment(segment: string): boolean {
  return SAFE_PATH_SEGMENT.test(segment);
}

interface BackendFetchOptions {
  method?: string;
  body?: unknown;
  accessToken?: string;
  searchParams?: URLSearchParams | Record<string, string | undefined>;
}

// Returns the parsed JSON body plus the raw status/headers so callers that
// need to relay a cookie (login) or a 204 (no body) can handle it
// themselves — most call sites only need backendJson() below.
//
// Defense in depth, independent of every call site's own segment
// validation above: after building the URL, assert it actually still
// points at the configured backend origin+prefix. A path that somehow
// still escapes it (a future call site that forgets to validate, a
// Node/WHATWG URL normalization quirk not yet known) fails loudly here
// instead of silently reaching something outside /api/v1.
export async function backendFetch(path: string, opts: BackendFetchOptions = {}) {
  const url = new URL(`${BACKEND_INTERNAL_URL.replace(/\/$/, "")}/${path.replace(/^\//, "")}`);
  if (url.origin !== BACKEND_ORIGIN || !url.pathname.startsWith(`${BACKEND_PREFIX_PATH}/`)) {
    throw new Error(
      `Refusing to call backend path outside ${BACKEND_PREFIX_PATH}: resolved to ${url.pathname}`,
    );
  }
  if (opts.searchParams) {
    const params =
      opts.searchParams instanceof URLSearchParams
        ? opts.searchParams
        : new URLSearchParams(
            Object.entries(opts.searchParams).filter(([, v]) => v !== undefined) as [
              string,
              string,
            ][],
          );
    params.forEach((value, key) => url.searchParams.set(key, value));
  }

  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.accessToken) headers["Authorization"] = `Bearer ${opts.accessToken}`;

  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });

  return res;
}

// Convenience helper for the common case: call the backend, parse JSON (or
// null for a 204), throw BackendError on a non-2xx so callers can let it
// bubble into a route handler's own error response.
export async function backendJson<T = unknown>(
  path: string,
  opts: BackendFetchOptions = {},
): Promise<T> {
  const res = await backendFetch(path, opts);
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new BackendError(res.status, body);
  return body as T;
}

export { BACKEND_INTERNAL_URL };
