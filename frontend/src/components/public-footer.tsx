"use client";

import { useTranslations } from "next-intl";
import { Shield, Sparkles } from "lucide-react";
import { Link } from "@/i18n/navigation";

export function PublicFooter() {
  const t = useTranslations();

  return (
    <footer className="border-t border-white/10 bg-[#020B2A] text-white px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-buildron-blue text-white text-xs font-bold shadow-xs">
                A
              </div>
              <span className="font-extrabold text-base tracking-tight text-white">
                {t("common.appName")}
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-400 max-w-md leading-relaxed">
              {t("common.tagline")}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-5 text-xs font-medium text-slate-300">
            <Link href="/list" className="hover:text-cyan-400 transition-colors">
              {t("common.directory")}
            </Link>
            <Link href="/login" className="hover:text-cyan-400 transition-colors">
              {t("common.login")}
            </Link>
            <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
              <span>{t("common.operational")}</span>
            </span>
          </div>
        </div>

        <div className="mt-8 border-t border-white/10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <p>© {new Date().getFullYear()} {t("common.appName")}. {t("common.copyright")}</p>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <Shield size={12} className="text-cyan-400" />
            <span className="flex items-center gap-1">
              <Sparkles size={11} className="text-cyan-400" />
              Buildron Appointments Core
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
