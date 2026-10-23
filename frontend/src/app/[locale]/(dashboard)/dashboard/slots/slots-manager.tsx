"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Calendar,
  Clock,
  Plus,
  Trash2,
  AlertCircle,
  Filter,
  Repeat,
} from "lucide-react";
import type { Service, Slot } from "@/lib/types";
import { localizedField } from "@/lib/locale-content";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

// ISO weekday index → WeekDay key (0=Sunday … 6=Saturday)
const ISO_TO_WEEKDAY = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;
type WeekdayKey = "MON" | "TUE" | "WED" | "THU" | "FRI";
const REPEAT_WEEKDAYS: WeekdayKey[] = ["MON", "TUE", "WED", "THU", "FRI"];

function formatDayHeader(iso: string, locale: string) {
  return new Date(iso).toLocaleDateString(locale, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatSlotTime(iso: string, locale: string) {
  return new Date(iso).toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function SlotsManager({
  platformId,
  services,
  initialSlots,
}: {
  platformId: string;
  services: Service[];
  initialSlots: Slot[];
}) {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const [slots, setSlots] = useState(
    [...initialSlots].sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
  );
  const [filterServiceId, setFilterServiceId] = useState<string | null>(null);
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [startsAt, setStartsAt] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(services[0]?.durationMinutes ?? 30);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Repeat / bulk-creation state
  const [repeatEnabled, setRepeatEnabled] = useState(false);
  const [repeatDays, setRepeatDays] = useState<WeekdayKey[]>([]);
  const [repeatEndDate, setRepeatEndDate] = useState("");
  const [createdCount, setCreatedCount] = useState<number | null>(null);

  const filteredSlots = useMemo(() => {
    if (!filterServiceId) return slots;
    return slots.filter((s) => s.serviceId === filterServiceId);
  }, [slots, filterServiceId]);

  // Group filtered slots by day
  const groupedSlots = useMemo(() => {
    const groups: { dateKey: string; heading: string; slots: Slot[] }[] = [];
    for (const slot of filteredSlots) {
      const d = new Date(slot.startsAt);
      const dateKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const last = groups[groups.length - 1];
      if (last && last.dateKey === dateKey) {
        last.slots.push(slot);
      } else {
        groups.push({
          dateKey,
          heading: formatDayHeader(slot.startsAt, locale),
          slots: [slot],
        });
      }
    }
    return groups;
  }, [filteredSlots, locale]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreatedCount(null);
    if (!serviceId || !startsAt) return;

    if (repeatEnabled) {
      // Validate repeat inputs
      if (repeatDays.length === 0) {
        setError(t("noWeekdaySelectedError"));
        return;
      }
      if (!repeatEndDate) {
        setError(t("noEndDateError"));
        return;
      }

      setCreating(true);
      const baseDate = new Date(startsAt);
      const endDate = new Date(repeatEndDate + "T23:59:59");
      const timeHours = baseDate.getHours();
      const timeMinutes = baseDate.getMinutes();

      // Collect all occurrence dates
      const occurrences: Date[] = [];
      const cursor = new Date(baseDate);
      // Move cursor to start of its day
      cursor.setHours(0, 0, 0, 0);

      while (cursor <= endDate) {
        const dayKey = ISO_TO_WEEKDAY[cursor.getDay()];
        if (repeatDays.includes(dayKey as WeekdayKey)) {
          const occurrence = new Date(cursor);
          occurrence.setHours(timeHours, timeMinutes, 0, 0);
          occurrences.push(occurrence);
        }
        cursor.setDate(cursor.getDate() + 1);
      }

      const newSlots: Slot[] = [];
      let firstError: string | null = null;

      for (const starts of occurrences) {
        const ends = new Date(starts.getTime() + durationMinutes * 60_000);
        try {
          const res = await fetch(`/api/dashboard/platforms/${platformId}/slots`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              serviceId,
              startsAt: starts.toISOString(),
              endsAt: ends.toISOString(),
            }),
          });
          const body = await res.json();
          if (res.ok) {
            newSlots.push(body);
          } else if (!firstError) {
            firstError = body?.message ?? t("slotCreateError");
          }
        } catch {
          if (!firstError) firstError = t("slotCreateErrorUnexpected");
        }
      }

      setSlots((prev) =>
        [...prev, ...newSlots].sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
      );
      setCreatedCount(newSlots.length);
      if (firstError && newSlots.length === 0) setError(firstError);
      setStartsAt("");
      setCreating(false);
      return;
    }

    // Single-slot path (unchanged)
    setCreating(true);
    const starts = new Date(startsAt);
    const ends = new Date(starts.getTime() + durationMinutes * 60_000);

    try {
      const res = await fetch(`/api/dashboard/platforms/${platformId}/slots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId,
          startsAt: starts.toISOString(),
          endsAt: ends.toISOString(),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.message ?? t("slotCreateError"));
        return;
      }
      setSlots((prev) => [...prev, body].sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
      setStartsAt("");
    } catch {
      setError(t("slotCreateErrorUnexpected"));
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(slotId: string) {
    setError(null);
    setDeletingId(slotId);

    try {
      const res = await fetch(`/api/dashboard/platforms/${platformId}/slots/${slotId}`, {
        method: "DELETE",
      });
      if (res.ok || res.status === 204) {
        setSlots((prev) => prev.filter((s) => s.id !== slotId));
      } else {
        const body = await res.json().catch(() => null);
        setError(body?.message ?? t("slotDeleteError"));
      }
    } catch {
      setError(t("slotDeleteErrorUnexpected"));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-12 items-start max-w-5xl">
      {/* Slots List Column */}
      <div className="space-y-5 lg:col-span-7">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
              {t("scheduledSlots")}
            </h2>
            <Badge variant="primary" size="sm">
              {filteredSlots.length}
            </Badge>
          </div>

          {/* Service filter pills */}
          {services.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
              <span className="text-muted-foreground me-1">
                <Filter size={12} />
              </span>
              <button
                type="button"
                onClick={() => setFilterServiceId(null)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                  filterServiceId === null
                    ? "bg-foreground text-background font-semibold"
                    : "bg-surface-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {t("filterAllLabel")}
              </button>
              {services.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setFilterServiceId(s.id)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                    filterServiceId === s.id
                      ? "bg-foreground text-background font-semibold"
                      : "bg-surface-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {localizedField(locale, s.name, s.nameAr) ?? s.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-2xl border border-danger/20 bg-danger-subtle p-3 text-xs text-danger">
            <AlertCircle size={15} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {filteredSlots.length === 0 ? (
          <Card className="flex flex-col items-center justify-center p-8 text-center border-dashed">
            <Calendar className="mb-2 text-muted-foreground" size={24} />
            <h3 className="text-sm font-bold text-foreground">{t("noSlotsTitle")}</h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-xs">
              {services.length === 0 ? t("noSlotsDescNoService") : t("noSlotsDescHasService")}
            </p>
          </Card>
        ) : (
          <div className="space-y-5">
            {groupedSlots.map((group) => (
              <div key={group.dateKey} className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  <Calendar size={13} className="text-primary" />
                  <span>{group.heading}</span>
                </div>

                <div className="space-y-2">
                  {group.slots.map((s) => (
                    <Card
                      key={s.id}
                      className="flex items-center justify-between p-3.5 transition-all duration-150 hover:border-primary/40 hover:shadow-xs"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-muted text-foreground">
                          <Clock size={15} />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-foreground">
                            {formatSlotTime(s.startsAt, locale)} – {formatSlotTime(s.endsAt, locale)}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Badge variant="neutral" size="sm">
                              {localizedField(locale, s.service.name, s.service.nameAr) ?? s.service.name}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDelete(s.id)}
                        disabled={deletingId === s.id}
                        className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-danger-subtle hover:text-danger disabled:opacity-50"
                        title={t("deleteSlotTitle")}
                      >
                        <Trash2 size={15} />
                      </button>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Slot Creator Form */}
      <div className="lg:col-span-5">
        <Card className="border-border bg-surface shadow-xs">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Plus size={18} className="text-primary" />
              <CardTitle>{t("createSlot")}</CardTitle>
            </div>
            <CardDescription>{t("createSlotDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            {services.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("addServiceFirstNote")}</p>
            ) : (
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <Label htmlFor="slot-service">{t("serviceLabel")}</Label>
                  <Select
                    id="slot-service"
                    value={serviceId}
                    onChange={(e) => {
                      setServiceId(e.target.value);
                      const svc = services.find((s) => s.id === e.target.value);
                      if (svc) setDurationMinutes(svc.durationMinutes);
                    }}
                  >
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {localizedField(locale, s.name, s.nameAr) ?? s.name} ({s.durationMinutes}m)
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <Label htmlFor="slot-starts-at">{t("startsAtLabel")}</Label>
                  <Input
                    id="slot-starts-at"
                    required
                    type="datetime-local"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                  />
                  {startsAt && (
                    <p className="mt-1 text-[11px] text-muted-foreground flex items-center gap-1">
                      <Clock size={11} />
                      <span>{t("durationNote", { minutes: durationMinutes })}</span>
                    </p>
                  )}
                </div>

                {/* Repeat toggle */}
                <div className="rounded-xl border border-border bg-surface-muted/40 p-3 space-y-3">
                  <button
                    type="button"
                    onClick={() => {
                      setRepeatEnabled((v) => !v);
                      setCreatedCount(null);
                    }}
                    className={`flex w-full items-center justify-between text-xs font-semibold transition-colors ${
                      repeatEnabled ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <Repeat size={13} />
                      {t("repeatToggleLabel")}
                    </span>
                    <span
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        repeatEnabled ? "bg-primary" : "bg-border-strong"
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-xs transition-transform ${
                          repeatEnabled
                            ? "translate-x-[18px] rtl:-translate-x-[18px]"
                            : "translate-x-1 rtl:-translate-x-1"
                        }`}
                      />
                    </span>
                  </button>

                  {repeatEnabled && (
                    <div className="space-y-3 pt-1 border-t border-border">
                      <div>
                        <Label>{t("repeatDaysLabel")}</Label>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {REPEAT_WEEKDAYS.map((day) => {
                            const active = repeatDays.includes(day);
                            return (
                              <button
                                key={day}
                                type="button"
                                aria-pressed={active}
                                onClick={() =>
                                  setRepeatDays((prev) =>
                                    active ? prev.filter((d) => d !== day) : [...prev, day],
                                  )
                                }
                                className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
                                  active
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-border bg-surface text-muted-foreground hover:bg-surface-muted"
                                }`}
                              >
                                {t(`weekdayShort.${day}`)}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="repeat-end-date">{t("repeatEndDateLabel")}</Label>
                        <Input
                          id="repeat-end-date"
                          type="date"
                          value={repeatEndDate}
                          onChange={(e) => setRepeatEndDate(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {createdCount !== null && (
                  <p className="text-xs text-success font-semibold">
                    {t("slotsCreatedCount", { count: createdCount })}
                  </p>
                )}

                <Button type="submit" loading={creating} className="w-full">
                  <Plus size={16} />
                  <span>
                    {creating
                      ? repeatEnabled
                        ? t("creatingSlots")
                        : t("addingSlot")
                      : t("openSlotButton")}
                  </span>
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
