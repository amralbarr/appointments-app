"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function startOfDay(d: Date) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

// Monday-first grid regardless of locale - this app's own seed data and
// business-hours editor already use SUN..SAT as the canonical week, but
// a calendar GRID reads better starting from the real current week's
// start than from a locale default that might not match either.
const WEEK_START = 0; // 0 = Sunday, matching WEEKDAYS in edit-profile-form.tsx

export function BookingCalendar({
  availableDayKeys,
  selectedDayKey,
  onSelectDay,
  locale,
}: {
  availableDayKeys: Set<string>;
  selectedDayKey: string | null;
  onSelectDay: (key: string) => void;
  locale: string;
}) {
  const t = useTranslations("bookingFlow");
  const today = useMemo(() => startOfDay(new Date()), []);
  const [viewMonth, setViewMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  const weeks = useMemo(() => {
    const firstOfMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const lastOfMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0);

    const leadingBlanks = (firstOfMonth.getDay() - WEEK_START + 7) % 7;
    const gridStart = new Date(firstOfMonth);
    gridStart.setDate(gridStart.getDate() - leadingBlanks);

    const cells: { date: Date; inMonth: boolean }[] = [];
    const cursor = new Date(gridStart);
    while (cursor <= lastOfMonth || cells.length % 7 !== 0) {
      cells.push({ date: new Date(cursor), inMonth: cursor.getMonth() === viewMonth.getMonth() });
      cursor.setDate(cursor.getDate() + 1);
      if (cells.length > 42) break; // 6 full weeks, hard safety stop
    }

    const result: { date: Date; inMonth: boolean }[][] = [];
    for (let i = 0; i < cells.length; i += 7) result.push(cells.slice(i, i + 7));
    return result;
  }, [viewMonth]);

  const weekdayLabels = useMemo(() => {
    // a fixed reference week (locale-aware weekday short names), rotated
    // to start on WEEK_START - the grid's own column order, not whatever
    // day today happens to be.
    const ref = new Date(2026, 0, 4); // a real Sunday, any year works
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(ref);
      d.setDate(ref.getDate() + ((WEEK_START + i) % 7));
      return d.toLocaleDateString(locale, { weekday: "short" });
    });
  }, [locale]);

  const canGoPrev = viewMonth.getFullYear() > today.getFullYear() || viewMonth.getMonth() > today.getMonth();
  const monthLabel = viewMonth.toLocaleDateString(locale, { month: "long", year: "numeric" });

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          aria-label={t("prevMonthAria")}
          disabled={!canGoPrev}
          onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent rtl:rotate-180"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-xs font-bold text-foreground">{monthLabel}</span>
        <button
          type="button"
          aria-label={t("nextMonthAria")}
          onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-muted hover:text-foreground rtl:rotate-180"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {weekdayLabels.map((label) => (
          <div key={label} className="pb-1 text-center text-[10px] font-semibold uppercase text-subtle-foreground">
            {label}
          </div>
        ))}

        {weeks.flat().map(({ date, inMonth }, i) => {
          const key = dayKey(date);
          const isPast = date < today;
          const hasSlots = availableDayKeys.has(key);
          const isSelected = selectedDayKey === key;
          const isToday = dayKey(today) === key;
          const disabled = isPast || !hasSlots;

          return (
            <button
              key={`${key}-${i}`}
              type="button"
              disabled={disabled}
              onClick={() => onSelectDay(key)}
              className={`relative flex aspect-square flex-col items-center justify-center rounded-xl text-xs font-medium transition-all duration-150 ${
                !inMonth ? "opacity-30" : ""
              } ${
                isSelected
                  ? "bg-primary text-primary-foreground font-bold shadow-xs"
                  : disabled
                    ? "text-subtle-foreground cursor-default"
                    : "text-foreground hover:bg-surface-muted cursor-pointer"
              } ${isToday && !isSelected ? "ring-1 ring-primary/40" : ""}`}
            >
              {date.getDate()}
              {hasSlots && !isSelected && (
                <span className="absolute bottom-1 h-1 w-1 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
