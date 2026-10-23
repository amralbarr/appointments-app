import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import {
  Calendar,
  Building2,
  Scissors,
  Clock,
  MessageSquare,
  ExternalLink,
  Store,
} from "lucide-react";
import { redirect, Link } from "@/i18n/navigation";
import { SESSION_COOKIE, getValidSession } from "@/lib/session";
import { NavLink } from "@/components/nav-link";
import { LogoutButton } from "@/components/logout-button";

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const jar = await cookies();
  const claims = getValidSession(jar.get(SESSION_COOKIE)?.value);
  if (!claims || claims.role !== "OWNER") {
    redirect({ href: "/login", locale });
  }
  const t = await getTranslations("dashboard");
  const tc = await getTranslations("common");

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top Application Bar */}
      <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="flex items-center gap-2 group">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-xs">
                <Store size={18} strokeWidth={2.5} />
              </div>
              <div>
                <span className="font-bold text-foreground text-sm tracking-tight block">
                  {t("tenantPortalName")}
                </span>
                <span className="text-[10px] text-muted-foreground block -mt-0.5">
                  {t("businessManagement")}
                </span>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/list"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-surface-muted hover:text-foreground transition-colors"
            >
              <span>{tc("viewPublicDirectory")}</span>
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
              <NavLink href="/dashboard" exact icon={<Building2 size={15} />}>
                {t("navProfile")}
              </NavLink>
              <NavLink href="/dashboard/services" icon={<Scissors size={15} />}>
                {t("navServices")}
              </NavLink>
              <NavLink href="/dashboard/slots" icon={<Calendar size={15} />}>
                {t("navSlots")}
              </NavLink>
              <NavLink href="/dashboard/bookings" icon={<Clock size={15} />}>
                {t("navBookings")}
              </NavLink>
              <NavLink href="/dashboard/chat-logs" icon={<MessageSquare size={15} />}>
                {t("navChatLogs")}
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
