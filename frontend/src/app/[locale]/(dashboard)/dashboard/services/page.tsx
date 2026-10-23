import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { getMyPlatform } from "@/lib/dashboard";
import { backendJson } from "@/lib/backend";
import { SESSION_COOKIE, requireSessionToken } from "@/lib/session";
import type { Service } from "@/lib/types";
import { ServicesManager } from "./services-manager";
import { Card } from "@/components/ui/card";
import { SuspendedPlatformBanner } from "@/components/suspended-platform-banner";

export default async function ServicesPage({
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

  const services = await backendJson<Service[]>(`platforms/${platform.id}/services`, {
    accessToken: token,
  });

  return (
    <div className="space-y-6">
      {!platform.isActive && <SuspendedPlatformBanner />}

      <div className="border-b border-border/80 pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("servicesTitle")}</h1>
        <p className="mt-1 text-xs text-muted-foreground">{t("servicesSubtitle")}</p>
      </div>

      <ServicesManager platformId={platform.id} initialServices={services} />
    </div>
  );
}
