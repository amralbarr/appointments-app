import { redirect } from "@/i18n/navigation";

// No real content lives at the locale root ("/ar" or "/en") — the public
// entry point is the tenant list. This file exists only so Next's
// required app/[locale]/page.tsx segment resolves; next-intl's redirect()
// keeps the active locale prefix on the target path.
export default async function RootPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({ href: "/list", locale });
}
