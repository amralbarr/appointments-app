import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { UserPlus } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { backendJson } from "@/lib/backend";
import { SESSION_COOKIE, requireSessionToken } from "@/lib/session";
import type { Platform } from "@/lib/types";
import { PlatformsTable } from "./platforms-table";

export default async function AdminPlatformsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const jar = await cookies();
  const token = requireSessionToken(jar.get(SESSION_COOKIE)?.value, locale);
  const t = await getTranslations("admin");

  const platforms = await backendJson<Platform[]>("admin/platforms", { accessToken: token });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border/80 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {t("platformDirectory")}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("platformDirectorySubtitle")}
          </p>
        </div>

        <Link
          href="/admin/tenants/new"
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary-hover transition-colors"
        >
          <UserPlus size={14} />
          <span>{t("provisionTenant")}</span>
        </Link>
      </div>

      <PlatformsTable initialPlatforms={platforms} />
    </div>
  );
}
