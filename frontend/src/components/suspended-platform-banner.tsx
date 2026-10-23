"use client";

import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";

export function SuspendedPlatformBanner() {
  const tc = useTranslations("common");

  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl border border-warning-border bg-warning-subtle p-4"
    >
      <AlertTriangle
        size={18}
        className="mt-0.5 shrink-0 text-amber-700"
        aria-hidden="true"
      />
      <div>
        <p className="text-sm font-bold text-amber-900">
          {tc("suspendedPlatformBannerTitle")}
        </p>
        <p className="mt-0.5 text-xs text-amber-800 leading-relaxed">
          {tc("suspendedPlatformBannerDesc")}
        </p>
      </div>
    </div>
  );
}
