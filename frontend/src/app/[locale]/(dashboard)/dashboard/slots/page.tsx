import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { getMyPlatform } from "@/lib/dashboard";
import { backendJson } from "@/lib/backend";
import { SESSION_COOKIE, requireSessionToken } from "@/lib/session";
import type { Service, Slot } from "@/lib/types";
import { SlotsManager } from "./slots-manager";
import { Card } from "@/components/ui/card";
import { SuspendedPlatformBanner } from "@/components/suspended-platform-banner";

export default async function SlotsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const jar = await cookies();
  const token = requireSessionToken(jar.get(SESSION_COOKIE)?.value, locale);
  const t = await getTranslations("dashboard");
  const platform = await getMyPlatform(token);
  if (!platform) {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        {t("noPlatformFound")}
      </Card>
    );
  }

  const [services, slots] = await Promise.all([
    backendJson<Service[]>(`platforms/${platform.id}/services`, { accessToken: token }),
    backendJson<Slot[]>(`platforms/${platform.id}/slots`, { searchParams: { onlyOpen: "false" } }),
  ]);

  return (
    <div className="space-y-6">
      {!platform.isActive && <SuspendedPlatformBanner />}

      <div className="border-b border-border/80 pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("slotsTitle")}</h1>
        <p className="mt-1 text-xs text-muted-foreground">{t("slotsSubtitle")}</p>
      </div>

      <SlotsManager platformId={platform.id} services={services} initialSlots={slots} />
    </div>
  );
}
