"use client";

import { useMemo, useState } from "react";
import {
  Search,
  MapPin,
  Clock,
  Phone,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Building2,
  CalendarCheck,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Avatar } from "@/components/avatar";
import { Card } from "@/components/ui/card";
import { localizedField } from "@/lib/locale-content";
import type { PublicPlatform } from "@/lib/types";

export function ListClient({ platforms }: { platforms: PublicPlatform[] }) {
  const t = useTranslations();
  const locale = useLocale();
  const isRtl = locale === "ar";
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return platforms;
    return platforms.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.nameAr?.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        p.descriptionAr?.toLowerCase().includes(q) ||
        p.address?.toLowerCase().includes(q),
    );
  }, [platforms, search]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      {/* Hero Header (Navy background with cyan sparkles) */}
      <div className="relative mb-10 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#06133F] via-[#0A1A50] to-[#020B2A] p-6 text-white shadow-xl sm:p-10">
        <div className="relative z-10 max-w-2xl">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-300">
            <Sparkles size={13} className="text-cyan-400" />
            <span>{t("public.heroBadge")}</span>
          </div>

          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl leading-tight">
            {t("public.heroTitle")}
          </h1>

          <p className="mt-3 text-sm sm:text-base text-slate-300 leading-relaxed">
            {t("public.heroSubtitle")}
          </p>

          {/* Search Bar */}
          <div className="relative mt-6 max-w-md">
            <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3.5 text-slate-400">
              <Search size={18} />
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("public.searchPlaceholder")}
              className="w-full rounded-2xl border border-white/20 bg-white/10 py-3 ps-10 pe-10 text-sm text-white placeholder:text-slate-400 backdrop-blur-md shadow-inner transition-all duration-150 focus:border-cyan-400 focus:bg-white/15 focus:outline-none focus:ring-4 focus:ring-cyan-400/20"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute inset-y-0 end-0 flex items-center pe-3 text-slate-400 hover:text-white"
                aria-label={t("public.clearSearchAria")}
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Quick statistics banner */}
        <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-white/10 pt-4 text-xs font-medium text-slate-300 sm:mt-8">
          <span className="flex items-center gap-1.5">
            <Building2 size={15} className="text-cyan-400" />
            <span>{platforms.length} {t("public.providersCount")}</span>
          </span>
          <span className="text-white/20">•</span>
          <span className="flex items-center gap-1.5">
            <CalendarCheck size={15} className="text-emerald-400" />
            <span>{t("public.acceptingBookings")}</span>
          </span>
        </div>
      </div>

      {/* Directory Grid */}
      {filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center border-dashed">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-muted text-muted-foreground">
            <Search size={22} />
          </div>
          <h3 className="font-semibold text-foreground text-base">{t("public.noProvidersFound")}</h3>
          <p className="mt-1.5 text-xs text-muted-foreground max-w-xs">
            {t("public.noProvidersFoundHint")}
          </p>
          {search && (
            <button
              onClick={() => setSearch("")}
              className="mt-4 rounded-xl bg-buildron-blue px-4 py-2 text-xs font-semibold text-white hover:bg-buildron-blue-dark transition-colors"
            >
              {t("public.clearSearch")}
            </button>
          )}
        </Card>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => {
            const displayName = localizedField(locale, p.name, p.nameAr) ?? p.name;
            const displayDescription = localizedField(locale, p.description, p.descriptionAr);
            const displayHours = localizedField(locale, p.businessHoursText, p.businessHoursTextAr);
            return (
            <Link key={p.id} href={`/${p.slug}`} className="group block focus:outline-none">
              <Card className="flex h-full flex-col overflow-hidden border-border bg-surface transition-all duration-200 ease-out group-hover:-translate-y-1 group-hover:border-buildron-blue/50 group-hover:shadow-xl group-focus-visible:ring-2 group-focus-visible:ring-buildron-blue">
                {/* Decorative Cover Header */}
                <div className="relative h-28 w-full bg-gradient-to-r from-[#06133F] via-[#0A1A50] to-[#1478E8] border-b border-border/50">
                  {p.coverImageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.coverImageUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>

                <div className="relative -mt-7 px-5 pb-5 pt-0 flex-1 flex flex-col justify-between">
                  <div>
                    {/* Avatar */}
                    <div className="mb-3 inline-block">
                      <Avatar name={displayName} logoUrl={p.logoUrl} size={54} className="ring-4 ring-surface shadow-md" />
                    </div>

                    <h3 className="font-bold text-base text-foreground group-hover:text-buildron-blue transition-colors">
                      {displayName}
                    </h3>

                    {displayDescription ? (
                      <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {displayDescription}
                      </p>
                    ) : (
                      <p className="mt-1.5 text-xs italic text-subtle-foreground">
                        {t("public.acceptingBookings")}
                      </p>
                    )}

                    {/* Metadata tags */}
                    <div className="mt-4 space-y-1.5 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                      {p.address && (
                        <div className="flex items-center gap-2 truncate">
                          <MapPin size={13} className="shrink-0 text-cyan-600" />
                          <span className="truncate">{p.address}</span>
                        </div>
                      )}
                      {p.phone && (
                        <div className="flex items-center gap-2 truncate">
                          <Phone size={13} className="shrink-0 text-cyan-600" />
                          <span className="truncate">{p.phone}</span>
                        </div>
                      )}
                      {displayHours && (
                        <div className="flex items-center gap-2 truncate">
                          <Clock size={13} className="shrink-0 text-cyan-600" />
                          <span className="truncate">{displayHours}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Action footer */}
                  <div className="mt-5 flex items-center justify-between border-t border-border/60 pt-3">
                    <span className="text-xs font-bold text-buildron-blue group-hover:text-buildron-blue-dark">
                      {t("public.viewProfile")}
                    </span>
                    <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-buildron-navy-light text-buildron-blue transition-transform duration-200 group-hover:scale-110">
                      {isRtl ? <ArrowLeft size={14} /> : <ArrowRight size={14} />}
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
