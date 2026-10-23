import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { ExternalLink } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getMyPlatform } from "@/lib/dashboard";
import { SESSION_COOKIE, requireSessionToken } from "@/lib/session";
import { EditProfileForm } from "./edit-profile-form";
import { Card } from "@/components/ui/card";
import { SuspendedPlatformBanner } from "@/components/suspended-platform-banner";

export default async function DashboardProfilePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const jar = await cookies();
  const token = requireSessionToken(jar.get(SESSION_COOKIE)?.value, locale);
  const t = await getTranslations("dashboard");
  const tc = await getTranslations("common");

  const platform = await getMyPlatform(token);

  if (!platform) {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        {t("noPlatformFound")}
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {!platform.isActive && <SuspendedPlatformBanner />}

      {/* Header bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/80 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {t("profileTitle")}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("profileSubtitle")}
          </p>
        </div>

        <Link
          href={`/${platform.slug}`}
          target="_blank"
          className="inline-flex items-center gap-1.5 rounded-xl border border-border-strong bg-surface px-3.5 py-2 text-xs font-semibold text-foreground shadow-2xs transition-colors hover:border-primary/50 hover:bg-surface-muted hover:text-primary"
        >
          <span>{tc("viewPublicPage")}</span>
          <ExternalLink size={13} />
        </Link>
      </div>

      <EditProfileForm platform={platform} />
    </div>
  );
}
