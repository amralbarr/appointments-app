import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { ChatWidget } from "@/components/chat-widget";
import { backendFetch } from "@/lib/backend";
import { localizedField } from "@/lib/locale-content";
import type { PublicPlatform, Slot } from "@/lib/types";
import { TenantPageClient } from "./tenant-page-client";

// Server Component: resolves the slug to a real platform (404 if
// suspended/nonexistent) and fetches the first page of open slots so
// there's real content on first paint.
export default async function TenantPage({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}) {
  const { slug, locale } = await params;
  const t = await getTranslations("bookingFlow");
  const tc = await getTranslations("common");

  const platformRes = await backendFetch(`platforms/public/${encodeURIComponent(slug)}`);
  if (platformRes.status === 404) notFound();
  const platform = (await platformRes.json()) as PublicPlatform;

  const slotsRes = await backendFetch(`platforms/${platform.id}/slots`, {
    searchParams: { onlyOpen: "true" },
  });
  const initialSlots = (await slotsRes.json()) as Slot[];

  const displayName = localizedField(locale, platform.name, platform.nameAr) ?? platform.name;

  return (
    <div className="min-h-full bg-background pb-16">
      {/* Breadcrumb / Back Bar */}
      <div className="border-b border-border/80 bg-surface/50 px-4 py-2.5 sm:px-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between text-xs text-muted-foreground">
          <Link
            href="/list"
            className="inline-flex items-center gap-1.5 font-medium hover:text-foreground transition-colors"
          >
            {locale === "ar" ? <ArrowRight size={13} /> : <ArrowLeft size={13} />}
            <span>{tc("backToDirectory")}</span>
          </Link>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-medium text-emerald-700">{t("liveBookingEngine")}</span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 pt-6 sm:px-6 sm:pt-8">
        <TenantPageClient platform={platform} initialSlots={initialSlots} />
      </div>

      {/* Floating AI Assistant Chat Widget */}
      <ChatWidget platformId={platform.id} slug={slug} platformName={displayName} />
    </div>
  );
}
