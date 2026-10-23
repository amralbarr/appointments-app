"use client";

import { useLocale, useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { Globe } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const t = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();

  const nextLocale = locale === "ar" ? "en" : "ar";

  function handleSwitch() {
    // router.replace from next-intl's own navigation re-prepends the new
    // locale onto the current (already locale-stripped) pathname, so a
    // visitor stays on the same page — just the other language.
    router.replace(
      // @ts-expect-error -- pathname is a typed route; params narrows it
      { pathname, params },
      { locale: nextLocale },
    );
  }

  return (
    <button
      type="button"
      onClick={handleSwitch}
      className={`inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-white/90 shadow-2xs backdrop-blur-xs transition-all hover:bg-white/10 hover:text-white active:scale-95 ${className}`}
      title={nextLocale === "ar" ? t("switchToArabic") : t("switchToEnglish")}
      aria-label="Toggle language"
    >
      <Globe size={13} className="text-cyan-400" />
      <span>{nextLocale === "ar" ? t("switchToArabic") : t("switchToEnglish")}</span>
    </button>
  );
}
