import createIntlMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

// Next.js 16 deprecated the `middleware.ts` file convention in favor of
// `proxy.ts` (export name `proxy`, not `middleware`) — see
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md.
// next-intl's createMiddleware() just returns a plain
// (NextRequest) => NextResponse function; it doesn't care what the
// exported binding is named, so aliasing it to `proxy` here is all the
// migration this needs.
const intlMiddleware = createIntlMiddleware(routing);

export function proxy(request: Parameters<typeof intlMiddleware>[0]) {
  return intlMiddleware(request);
}

export const config = {
  // Run on every path except API routes (app/api/** — never locale-
  // prefixed, see FRONTEND-ARCHITECTURE.md's BFF pattern), Next's internal
  // _next assets, and any request for a file with an extension (static
  // assets under public/).
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
