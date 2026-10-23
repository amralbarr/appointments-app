import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { ShieldCheck, LayoutGrid, UserPlus, ExternalLink } from "lucide-react";
import { redirect, Link } from "@/i18n/navigation";
import { SESSION_COOKIE, getValidSession } from "@/lib/session";
import { NavLink } from "@/components/nav-link";
import { LogoutButton } from "@/components/logout-button";

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const jar = await cookies();
  const claims = getValidSession(jar.get(SESSION_COOKIE)?.value);
  if (!claims || claims.role !== "ADMIN") {
    redirect({ href: "/login", locale });
  }
  const t = await getTranslations("admin");

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top Application Bar */}
      <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="flex items-center gap-2 group">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-600 text-white shadow-xs">
                <ShieldCheck size={18} strokeWidth={2.5} />
              </div>
              <div>
                <span className="font-bold text-foreground text-sm tracking-tight block">
                  {t("systemSuperadmin")}
                </span>
                <span className="text-[10px] text-muted-foreground block -mt-0.5">
                  {t("platformOperations")}
                </span>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/list"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-surface-muted hover:text-foreground transition-colors"
            >
              <span>{t("publicDirectoryLink")}</span>
              <ExternalLink size={12} />
            </Link>
            <div className="h-4 w-px bg-border hidden sm:block" />
            <LogoutButton />
          </div>
        </div>

        {/* Sub Navigation Tabs */}
        <div className="border-t border-border/60 bg-surface/50 px-4 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <nav className="flex gap-1.5 overflow-x-auto py-2 no-scrollbar">
              <NavLink href="/admin" exact icon={<LayoutGrid size={15} />}>
                {t("navAllPlatforms")}
              </NavLink>
              <NavLink href="/admin/tenants/new" icon={<UserPlus size={15} />}>
                {t("navCreateTenant")}
              </NavLink>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 py-8 px-4 sm:px-6">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
