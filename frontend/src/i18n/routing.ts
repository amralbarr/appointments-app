import { defineRouting } from "next-intl/routing";

// Arabic is this platform's default locale (see docs/FRONTEND-ARCHITECTURE.md's
// i18n/RTL section) — English is the secondary, opt-in locale.
//
// localePrefix: "always" — every path carries an explicit /ar or /en
// prefix, including the default locale. Chosen over the more common
// "as-needed" (default locale unprefixed) for three concrete reasons:
//   1. Symmetry/explicitness: /ar/dana-family-clinic and
//      /en/dana-family-clinic are both real, independently bookmarkable
//      and shareable URLs — no ambiguity about which locale a bare path
//      resolves to, and no special-cased redirect-away behavior for the
//      default locale.
//   2. hreflang/SEO: an explicit prefix on every locale makes generating
//      correct alternate-language <link rel="alternate" hreflang> tags
//      and per-locale sitemaps straightforward later — "as-needed" means
//      the default locale's canonical URL and its hreflang-tagged URL
//      differ, which is a common source of duplicate-content SEO bugs.
//   3. It matches this platform's own real verification/testing
//      convention of hitting /ar/<slug> and /en/<slug> directly as two
//      parallel, equally-real routes.
export const routing = defineRouting({
  locales: ["ar", "en"],
  defaultLocale: "ar",
  localePrefix: "always",
  // next-intl's middleware auto-detects a preferred locale from the
  // visitor's Accept-Language header (and a NEXT_LOCALE cookie, once one
  // exists) by default - it ignores defaultLocale above entirely for a
  // bare, unprefixed path the moment any detection signal matches a
  // supported locale, which is true for most real visitors (most
  // browsers report "en" even for a visitor who reads Arabic fine).
  // Found live on the real deployed site: a bare https://.../list
  // visit was redirecting to /en/list, not /ar/list, despite
  // defaultLocale: "ar" above. Disabling detection makes that default
  // genuinely unconditional - every bare path always redirects to /ar,
  // regardless of browser language; a visitor who wants English still
  // gets it the moment they're on any /en/... page or use the language
  // switcher, same as before.
  localeDetection: false,
});

export type AppLocale = (typeof routing.locales)[number];
