"use client";

import { useLocale, useTranslations } from "next-intl";
import { Calendar, Sparkles, ArrowRight, ArrowLeft, LogIn } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { LanguageSwitcher } from "./language-switcher";

export function PublicHeader() {
  const t = useTranslations();
  const isRtl = useLocale() === "ar";

  return (
    <>
      {/* Top Banner (Navy & Cyan accent) */}
      <div className="bg-[#020B2A] border-b border-white/10 px-4 py-2 text-center text-xs font-medium text-cyan-300">
        <div className="mx-auto flex max-w-5xl items-center justify-center gap-2">
          <Sparkles size={13} className="text-cyan-400 animate-pulse" />
          <span>{t("public.heroBadge")} — {t("common.tagline")}</span>
        </div>
      </div>

      {/* Main Header */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#06133F]/95 px-4 py-3 backdrop-blur-md shadow-md sm:px-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          {/* Brand */}
          <Link href="/list" className="flex items-center gap-2.5 group">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-buildron-blue to-cyan-500 text-white shadow-md shadow-blue-500/20 transition-transform group-hover:scale-105">
              <Calendar size={20} strokeWidth={2.5} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold tracking-tight text-white text-base">
                  {t("common.appName")}
                </span>
                <span className="rounded-full bg-cyan-400/20 border border-cyan-400/30 px-2 py-0.5 text-[10px] font-bold text-cyan-300">
                  {t("common.live")}
                </span>
              </div>
              <p className="text-[10px] text-slate-300/80 -mt-0.5 hidden sm:block">
                {t("common.platformTagline")}
              </p>
            </div>
          </Link>

          {/* Navigation & Controls */}
          <div className="flex items-center gap-3">
            <Link
              href="/list"
              className="text-xs font-semibold text-slate-200 transition-colors hover:text-white px-2.5 py-1.5 rounded-xl hover:bg-white/10"
            >
              {t("common.directory")}
            </Link>

            <LanguageSwitcher />

            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 rounded-xl bg-buildron-blue px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-buildron-blue-dark active:scale-95 transition-all"
            >
              <LogIn size={13} />
              <span>{t("common.login")}</span>
              {isRtl ? <ArrowLeft size={13} /> : <ArrowRight size={13} />}
            </Link>
          </div>
        </div>
      </header>
    </>
  );
}
