"use client";

import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Calendar,
  Clock,
  MapPin,
  Phone,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Check,
  User,
  Mail,
  ShieldCheck,
  XCircle,
  RotateCcw,
  Globe,
  CalendarPlus,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { connectToPlatformRoom } from "@/lib/socket";
import type { PublicPlatform, Slot, Booking } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/avatar";
import { CopyButton } from "@/components/copy-button";
import { localizedField } from "@/lib/locale-content";
import { BookingCalendar } from "./booking-calendar";
import { buildGoogleCalendarUrl, buildIcsBlob } from "@/lib/calendar-link";

function formatTimeOnly(iso: string, locale: string) {
  return new Date(iso).toLocaleTimeString(locale, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDayHeading(iso: string, locale: string, todayLabel: string, tomorrowLabel: string) {
  const d = new Date(iso);
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow =
    d.getDate() === tomorrow.getDate() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getFullYear() === tomorrow.getFullYear();

  const formatted = d.toLocaleDateString(locale, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  if (isToday) return `${todayLabel} — ${formatted}`;
  if (isTomorrow) return `${tomorrowLabel} — ${formatted}`;
  return formatted;
}

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}


export function TenantPageClient({
  platform,
  initialSlots,
}: {
  platform: PublicPlatform;
  initialSlots: Slot[];
}) {
  const t = useTranslations("bookingFlow");
  const tc = useTranslations("common");
  const locale = useLocale();
  const shouldReduceMotion = useReducedMotion();

  // framer-motion variants — empty objects when prefers-reduced-motion is on
  const fadeSlide = shouldReduceMotion
    ? { initial: {}, animate: {}, exit: {} }
    : {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -8 },
      };
  const iconPop = shouldReduceMotion
    ? { initial: {}, animate: {} }
    : { initial: { scale: 0.6, opacity: 0 }, animate: { scale: 1, opacity: 1 } };

  const [slots, setSlots] = useState<Slot[]>(initialSlots);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [booking, setBooking] = useState<Booking | null>(null);
  // a snapshot of the slot at the moment it was actually booked - the
  // live socket refetch below removes booked slots from `slots` (that's
  // the whole point, so every OTHER viewer sees it disappear too), but
  // that same refetch reaches the booking customer's own socket as well.
  // Deriving the confirmation voucher's service/date/time from the live
  // `slots` list would blank those fields out from under the very
  // customer who just booked, the instant their own refetch lands.
  const [bookedSlot, setBookedSlot] = useState<Slot | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const confirmationRef = useRef<HTMLDivElement>(null);

  // Scroll the right column into view on mobile whenever the user either
  // picks a slot (booking form appears) or finishes booking (confirmation
  // card appears). Below the lg breakpoint the columns stack vertically
  // so the right column is off-screen; on desktop it's always visible in
  // the sticky sidebar and scrolling is unnecessary / would be jarring.
  useEffect(() => {
    if ((selectedSlotId || booking) && typeof window !== "undefined" && window.innerWidth < 1024) {
      confirmationRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [selectedSlotId, booking]);

  // Live refetch on socket slot events
  useEffect(() => {
    const socket = connectToPlatformRoom(platform.id);
    const refetch = () => {
      fetch(`/api/public/slots/${platform.id}?onlyOpen=true`)
        .then((res) => res.json())
        .then((data: Slot[]) => setSlots(data))
        .catch(() => undefined);
    };
    socket.on("slot.booked", refetch);
    socket.on("slot.cancelled", refetch);
    return () => {
      socket.disconnect();
    };
  }, [platform.id]);

  // If another customer books the exact slot THIS customer currently has
  // selected (picked, but not yet submitted) before they hit confirm, the
  // live refetch above drops it out of `slots` same as for any other
  // viewer. Without this, the selection would just silently fall back to
  // the empty guide card with no explanation — bump them back to picking
  // a time with a clear reason instead of a confusing disappearing form.
  useEffect(() => {
    if (!selectedSlotId || booking) return;
    const stillOpen = slots.some((s) => s.id === selectedSlotId);
    if (!stillOpen) {
      startTransition(() => {
        setSelectedSlotId(null);
        setError(t("slotTakenNotice"));
      });
    }
  }, [slots, selectedSlotId, booking, t]);

  const services = useMemo(() => {
    const byId = new Map<string, Slot["service"]>();
    for (const slot of slots) byId.set(slot.service.id, slot.service);
    return Array.from(byId.values());
  }, [slots]);

  // a customer must pick exactly one service before any time option
  // appears - mixing every service's slots into one list reads as "the
  // business has these open times" rather than "here's when THIS
  // service is available," and a 20-minute haircut slot next to a
  // 45-minute coloring slot at the same displayed time is actively
  // misleading. No selectedServiceId means no visible slots at all.
  const visibleSlots = useMemo(
    () => (selectedServiceId ? slots.filter((s) => s.serviceId === selectedServiceId) : []),
    [slots, selectedServiceId],
  );

  // one Set entry per calendar day that has >=1 slot matching the current
  // service filter - the calendar only ever lets a customer pick a day
  // that's actually bookable, never an empty one that just 404s further
  // selections.
  const availableDayKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const slot of visibleSlots) keys.add(dayKey(slot.startsAt));
    return keys;
  }, [visibleSlots]);

  const sortedAvailableDayKeys = useMemo(
    () =>
      Array.from(availableDayKeys).sort(
        (a, b) => new Date(visibleSlots.find((s) => dayKey(s.startsAt) === a)!.startsAt).getTime() -
          new Date(visibleSlots.find((s) => dayKey(s.startsAt) === b)!.startsAt).getTime(),
      ),
    [availableDayKeys, visibleSlots],
  );

  // falls back to the earliest real available day the moment the
  // customer's actual selection stops being valid (switching service
  // filters, or the selected day's last open slot just got taken by
  // someone else over the realtime socket) - never silently shows an
  // empty day the customer didn't actually choose.
  const effectiveDayKey =
    selectedDayKey && availableDayKeys.has(selectedDayKey) ? selectedDayKey : sortedAvailableDayKeys[0] ?? null;

  const daySlots = useMemo(
    () =>
      effectiveDayKey
        ? visibleSlots
            .filter((s) => dayKey(s.startsAt) === effectiveDayKey)
            .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
        : [],
    [visibleSlots, effectiveDayKey],
  );

  const selectedSlot = useMemo(
    () => slots.find((s) => s.id === selectedSlotId) ?? null,
    [slots, selectedSlotId],
  );

  async function handleBook(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSlotId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/slots/${platform.id}/${selectedSlotId}/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerName, customerEmail }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.message ?? t("genericBookingError"));
        return;
      }
      setBookedSlot(selectedSlot);
      setBooking(body as Booking);
    } catch {
      setError(t("unexpectedBookingError"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel() {
    if (!booking?.cancelToken) return;
    setCancelling(true);
    try {
      const res = await fetch(
        `/api/public/bookings/${booking.id}?cancelToken=${encodeURIComponent(booking.cancelToken)}`,
        { method: "DELETE" },
      );
      if (res.ok) {
        setCancelled(true);
      } else {
        const body = await res.json().catch(() => null);
        setError(body?.message ?? t("cancelError"));
      }
    } finally {
      setCancelling(false);
    }
  }

  function handleReset() {
    setBooking(null);
    setBookedSlot(null);
    setCancelled(false);
    setSelectedSlotId(null);
    setError(null);
  }

  function handleDownloadIcs() {
    if (!bookedSlot) return;
    const title = localizedField(locale, bookedSlot.service.name, bookedSlot.service.nameAr) ?? bookedSlot.service.name;
    const blob = buildIcsBlob({
      startsAt: bookedSlot.startsAt,
      endsAt: bookedSlot.endsAt,
      title: `${title} — ${displayName}`,
      location: platform.address ?? undefined,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "appointment.ics";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  function getGoogleCalendarUrl() {
    if (!bookedSlot) return "#";
    const title = localizedField(locale, bookedSlot.service.name, bookedSlot.service.nameAr) ?? bookedSlot.service.name;
    return buildGoogleCalendarUrl({
      startsAt: bookedSlot.startsAt,
      endsAt: bookedSlot.endsAt,
      title: `${title} — ${displayName}`,
      location: platform.address ?? undefined,
    });
  }

  const displayName = localizedField(locale, platform.name, platform.nameAr) ?? platform.name;
  const displayDescription = localizedField(locale, platform.description, platform.descriptionAr);
  const displayHours = localizedField(locale, platform.businessHoursText, platform.businessHoursTextAr);

  return (
    <div className="space-y-8">
      {/* Platform Profile Card Header */}
      <div className="relative overflow-hidden rounded-3xl border border-border bg-surface shadow-xs">
        {/* Cover banner */}
        <div className="relative h-36 w-full bg-gradient-to-r from-primary/20 via-indigo-500/15 to-purple-500/20 sm:h-44">
          {platform.coverImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={platform.coverImageUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          )}
          <div className="absolute top-4 end-4 flex items-center gap-2">
            <Badge variant="primary" className="bg-surface/90 font-mono shadow-xs backdrop-blur-xs">
              /{platform.slug}
            </Badge>
          </div>
        </div>

        {/* Profile Content */}
        <div className="relative px-5 pb-6 pt-0 sm:px-8 sm:pb-8">
          <div className="-mt-12 flex flex-col gap-4 sm:-mt-14 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-end gap-4">
              <Avatar
                name={displayName}
                logoUrl={platform.logoUrl}
                size={76}
                className="ring-4 ring-surface shadow-md"
              />
              <div className="mb-1">
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                    {displayName}
                  </h1>
                  <span title={t("verifiedBusiness")} className="text-primary">
                    <CheckCircle2 size={18} />
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                  <span className="flex items-center gap-1 text-emerald-700 font-medium">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    {t("acceptingAppointments")}
                  </span>
                  {platform.timezone && (
                    <>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Globe size={12} />
                        {platform.timezone}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {displayDescription && (
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base max-w-3xl">
              {displayDescription}
            </p>
          )}

          {/* Contact Details row */}
          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border/60 pt-4 text-xs font-medium text-muted-foreground">
            {platform.address && (
              <div className="flex items-center gap-1.5">
                <MapPin size={14} className="text-primary shrink-0" />
                <span>{platform.address}</span>
              </div>
            )}
            {platform.phone && (
              <a
                href={`tel:${platform.phone}`}
                className="flex items-center gap-1.5 hover:text-primary transition-colors"
              >
                <Phone size={14} className="text-primary shrink-0" />
                <span>{platform.phone}</span>
              </a>
            )}
            {displayHours && (
              <div className="flex items-center gap-1.5">
                <Clock size={14} className="text-primary shrink-0" />
                <span>{displayHours}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3-Step Progress Stepper */}
      {(() => {
        const step = booking ? 3 : selectedSlot ? 2 : 1;
        const steps = [
          { n: 1, label: t("step1Title") },
          { n: 2, label: t("step2Title") },
          { n: 3, label: t("step3Title") },
        ];
        return (
          <div className="flex items-center gap-0 overflow-hidden rounded-2xl border border-border bg-surface shadow-xs">
            {steps.map((s, idx) => {
              const isDone = step > s.n;
              const isCurrent = step === s.n;
              return (
                <div key={s.n} className="flex flex-1 items-center">
                  <div
                    className={`flex flex-1 items-center justify-center gap-2 px-3 py-2.5 text-xs font-semibold transition-colors ${
                      isDone
                        ? "bg-success-subtle text-success"
                        : isCurrent
                        ? "bg-primary text-primary-foreground"
                        : "bg-surface text-muted-foreground"
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold shrink-0 ${
                        isDone
                          ? "bg-success text-primary-foreground"
                          : isCurrent
                          ? "bg-primary-foreground/20 text-primary-foreground"
                          : "bg-surface-muted text-foreground"
                      }`}
                    >
                      {isDone ? <Check size={11} strokeWidth={3} /> : s.n}
                    </span>
                    <span className="hidden sm:inline">{s.label}</span>
                  </div>
                  {idx < steps.length - 1 && (
                    <div
                      className={`h-full w-px shrink-0 self-stretch ${
                        step > s.n ? "bg-success/30" : "bg-border"
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Main Booking Interface */}
      <div className="grid gap-8 lg:grid-cols-12 items-start">
        {/* Left Column: Services & Slot selection */}
        <div className="space-y-6 lg:col-span-7">
          {/* 1. Services Selector */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
                {t("step1Title")}
              </h2>
            </div>

            <div className="flex flex-wrap gap-2">
              {services.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setSelectedServiceId(s.id);
                    setSelectedDayKey(null);
                    setSelectedSlotId(null);
                  }}
                  className={`min-w-0 rounded-xl border px-4 py-2 text-xs font-semibold transition-all duration-150 ${
                    selectedServiceId === s.id
                      ? "border-primary bg-primary text-primary-foreground shadow-xs"
                      : "border-border bg-surface text-foreground hover:border-primary/40 hover:bg-surface-muted"
                  }`}
                >
                  <span>{localizedField(locale, s.name, s.nameAr) ?? s.name}</span>
                  <span
                    className={`ms-1.5 text-[10px] ${
                      selectedServiceId === s.id ? "text-primary-foreground/80" : "text-muted-foreground"
                    }`}
                  >
                    ({s.durationMinutes}m)
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* 2. Open Slots Section */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
                  {t("step2Title")}
                </h2>
                <span className="flex h-2 w-2 rounded-full bg-emerald-500" title={t("realtimeSynced")} />
              </div>
              <span className="text-xs text-muted-foreground">
                {t("slotsOpen", { count: visibleSlots.length })}
              </span>
            </div>

            {!selectedServiceId ? (
              <Card className="flex flex-col items-center justify-center p-8 text-center">
                <Sparkles className="mb-2 text-muted-foreground" size={28} />
                <h3 className="font-semibold text-foreground text-sm">{t("selectServiceFirstTitle")}</h3>
                <p className="mt-1 text-xs text-muted-foreground max-w-xs">
                  {t("selectServiceFirstDesc")}
                </p>
              </Card>
            ) : visibleSlots.length === 0 ? (
              <Card className="flex flex-col items-center justify-center p-8 text-center">
                <Calendar className="mb-2 text-muted-foreground" size={28} />
                <h3 className="font-semibold text-foreground text-sm">{t("noOpenSlotsTitle")}</h3>
                <p className="mt-1 text-xs text-muted-foreground max-w-xs">
                  {t("noOpenSlotsDescFiltered")}
                </p>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
                <BookingCalendar
                  availableDayKeys={availableDayKeys}
                  selectedDayKey={effectiveDayKey}
                  onSelectDay={(key) => {
                    setSelectedDayKey(key);
                    setSelectedSlotId(null);
                  }}
                  locale={locale}
                />

                <div className="space-y-2.5">
                  {effectiveDayKey && (
                    <div className="flex items-center gap-2">
                      <Calendar size={14} className="text-primary" />
                      <h3 className="text-xs font-bold uppercase tracking-wide text-foreground">
                        {formatDayHeading(daySlots[0].startsAt, locale, t("today"), t("tomorrow"))}
                      </h3>
                    </div>
                  )}

                  {daySlots.length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t("selectDatePrompt")}</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2.5">
                      {daySlots.map((slot) => {
                        const isSelected = selectedSlotId === slot.id;
                        return (
                          <button
                            key={slot.id}
                            type="button"
                            onClick={() => {
                              setSelectedSlotId(slot.id);
                              setError(null);
                            }}
                            className={`group relative flex flex-col rounded-2xl border p-3.5 text-start transition-all duration-150 active:scale-[0.99] ${
                              isSelected
                                ? "border-primary bg-primary-subtle ring-2 ring-primary/30 shadow-xs"
                                : "border-border bg-surface hover:border-primary/50 hover:bg-surface-muted/50"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-bold text-foreground">
                                {formatTimeOnly(slot.startsAt, locale)} – {formatTimeOnly(slot.endsAt, locale)}
                              </span>
                              {isSelected ? (
                                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                  <Check size={12} strokeWidth={3} />
                                </div>
                              ) : (
                                <span className="text-[11px] font-medium text-subtle-foreground group-hover:text-primary">
                                  {slot.service.durationMinutes}m
                                </span>
                              )}
                            </div>

                            <div className="mt-1 flex items-center justify-between text-xs">
                              <span
                                className={`font-medium ${
                                  isSelected ? "text-primary font-semibold" : "text-muted-foreground"
                                }`}
                              >
                                {localizedField(locale, slot.service.name, slot.service.nameAr) ?? slot.service.name}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Sticky Booking Card / Voucher */}
        <div ref={confirmationRef} className="lg:col-span-5 lg:sticky lg:top-20">
          <AnimatePresence mode="wait">
          {booking ? (
            /* Digital Confirmation Voucher */
            <motion.div
              key="voucher"
              {...fadeSlide}
              transition={{ duration: 0.18 }}
            >
            <Card className="overflow-hidden border-border bg-surface shadow-md">
              <div
                className={`p-6 text-center ${
                  cancelled
                    ? "bg-danger-subtle border-b border-danger/20 text-danger"
                    : "bg-success-subtle border-b border-success/20 text-success"
                }`}
              >
                <motion.div
                  className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface shadow-xs"
                  {...(cancelled ? {} : iconPop)}
                  transition={{ duration: 0.25, type: "spring", stiffness: 260, damping: 20 }}
                >
                  {cancelled ? <XCircle size={28} /> : <CheckCircle2 size={28} />}
                </motion.div>
                <h3 className="text-lg font-bold">
                  {cancelled ? t("bookingCancelledTitle") : t("bookingConfirmedTitle")}
                </h3>
                <p className="mt-1 text-xs opacity-90">
                  {cancelled ? t("bookingCancelledDesc") : t("bookingConfirmedDesc")}
                </p>
              </div>

              <div className="p-6 space-y-4">
                {/* Appointment Summary Box */}
                <div className="rounded-2xl border border-border bg-surface-muted/60 p-4 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("businessLabel")}</span>
                    <span className="font-semibold text-foreground">{displayName}</span>
                  </div>
                  {bookedSlot && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t("serviceLabel")}</span>
                        <span className="font-semibold text-foreground">
                          {localizedField(locale, bookedSlot.service.name, bookedSlot.service.nameAr) ??
                            bookedSlot.service.name}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t("dateLabel")}</span>
                        <span className="font-semibold text-foreground">
                          {formatDayHeading(bookedSlot.startsAt, locale, t("today"), t("tomorrow"))}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t("timeLabel")}</span>
                        <span className="font-semibold text-foreground">
                          {formatTimeOnly(bookedSlot.startsAt, locale)} – {formatTimeOnly(bookedSlot.endsAt, locale)}
                        </span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between border-t border-border pt-2">
                    <span className="text-muted-foreground">{t("customerLabel")}</span>
                    <span className="font-semibold text-foreground">{customerName}</span>
                  </div>
                </div>

                {!cancelled && bookedSlot && (
                  <>
                    {/* Add to Calendar action row */}
                    <div className="flex gap-2">
                      <a
                        href={getGoogleCalendarUrl()}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-xs font-semibold text-foreground shadow-xs transition-all duration-150 hover:border-primary/50 hover:bg-surface-muted"
                      >
                        <CalendarPlus size={13} />
                        <span className="hidden sm:inline">{t("addToGoogleCalendar")}</span>
                        <span className="sm:hidden">{t("addToCalendarLabel")}</span>
                      </a>
                      <button
                        type="button"
                        onClick={handleDownloadIcs}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-xs font-semibold text-foreground shadow-xs transition-all duration-150 hover:border-primary/50 hover:bg-surface-muted"
                      >
                        <CalendarPlus size={13} />
                        <span className="hidden sm:inline">{t("downloadIcs")}</span>
                        <span className="sm:hidden">.ics</span>
                      </button>
                    </div>

                    {/* Cancellation Code Box */}
                    <div className="rounded-2xl border border-warning-border bg-warning-subtle p-4">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                          <AlertCircle size={14} />
                          {t("cancellationCodeTitle")}
                        </span>
                        {booking.cancelToken && (
                          <CopyButton
                            text={booking.cancelToken}
                            label={t("copyCode")}
                            copiedLabel={tc("copied")}
                            copyTitleAria={tc("copyTitleAria", { label: t("copyCode") })}
                          />
                        )}
                      </div>
                      <p className="text-xs text-amber-800 leading-relaxed mb-2">
                        {t("cancellationCodeDesc")}
                      </p>
                      <div className="rounded-xl border border-amber-300/80 bg-surface/80 p-2 text-center">
                        <code className="font-mono text-sm font-bold tracking-wider text-foreground">
                          {booking.cancelToken}
                        </code>
                      </div>
                    </div>

                    <div className="pt-2 flex flex-col gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleCancel}
                        disabled={cancelling}
                        loading={cancelling}
                        className="w-full text-danger border-danger/20 hover:bg-danger-subtle hover:text-danger"
                      >
                        {t("cancelBookingButton")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleReset}
                        className="w-full text-xs text-muted-foreground"
                      >
                        {t("bookAnotherButton")}
                      </Button>
                    </div>
                  </>
                )}

                {cancelled && (
                  <Button variant="primary" size="md" onClick={handleReset} className="w-full mt-2">
                    <RotateCcw size={14} className="me-1.5" />
                    {t("bookAnotherSlotButton")}
                  </Button>
                )}
              </div>
            </Card>
            </motion.div>
          ) : selectedSlot ? (
            /* Selected Slot Confirmation Form */
            <motion.div
              key="form"
              {...fadeSlide}
              transition={{ duration: 0.18 }}
            >
            <Card className="overflow-hidden border-border bg-surface shadow-md">
              <div className="border-b border-border bg-surface-muted/50 p-5">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
                  <Check size={14} />
                  <span>{t("selectedAppointmentLabel")}</span>
                </div>
                <h3 className="mt-1 text-base font-bold text-foreground">
                  {localizedField(locale, selectedSlot.service.name, selectedSlot.service.nameAr) ??
                    selectedSlot.service.name}
                </h3>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1 font-medium text-foreground">
                    <Calendar size={13} className="text-primary" />
                    {formatDayHeading(selectedSlot.startsAt, locale, t("today"), t("tomorrow"))}
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1 font-medium text-foreground">
                    <Clock size={13} className="text-primary" />
                    {formatTimeOnly(selectedSlot.startsAt, locale)} – {formatTimeOnly(selectedSlot.endsAt, locale)}
                  </span>
                </div>
              </div>

              <form onSubmit={handleBook} className="p-5 space-y-4">
                <div>
                  <Label htmlFor="customerName" className="flex items-center gap-1.5">
                    <User size={13} />
                    <span>{t("yourFullName")}</span>
                  </Label>
                  <Input
                    id="customerName"
                    required
                    minLength={2}
                    placeholder={t("yourFullNamePlaceholder")}
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="customerEmail" className="flex items-center gap-1.5">
                    <Mail size={13} />
                    <span>{t("yourEmailAddress")}</span>
                  </Label>
                  <Input
                    id="customerEmail"
                    required
                    type="email"
                    placeholder="you@example.com"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {t("confirmationEmailNote")}
                  </p>
                </div>

                {error && (
                  <div className="rounded-xl border border-danger/20 bg-danger-subtle p-3 text-xs text-danger flex items-start gap-2">
                    <AlertCircle size={15} className="shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <Button type="submit" loading={submitting} size="lg" className="w-full">
                  {submitting ? t("reservingSlot") : t("confirmAppointment")}
                </Button>

                <div className="flex items-center justify-center gap-1.5 text-[11px] text-subtle-foreground pt-1">
                  <ShieldCheck size={13} className="text-emerald-600" />
                  <span>{t("instantConfirmationNote")}</span>
                </div>
              </form>
            </Card>
            </motion.div>
          ) : (
            /* Guide Card when no slot is selected yet */
            <motion.div
              key="guide"
              {...fadeSlide}
              transition={{ duration: 0.18 }}
            >
            <Card className="border-dashed border-2 border-border bg-surface/50 p-6 text-center">
              {error && (
                <div className="mb-4 rounded-xl border border-danger/20 bg-danger-subtle p-3 text-xs text-danger flex items-start gap-2 text-start">
                  <AlertCircle size={15} className="shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-subtle text-primary">
                <Sparkles size={22} />
              </div>
              <h3 className="font-bold text-foreground text-sm">{t("selectTimeSlotTitle")}</h3>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed max-w-xs mx-auto">
                {t("selectTimeSlotDesc")}
              </p>

              <div className="mt-6 border-t border-border pt-4 text-start space-y-2.5 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-muted text-[10px] font-bold text-foreground">
                    1
                  </span>
                  <span>{t("guideStep1")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-muted text-[10px] font-bold text-foreground">
                    2
                  </span>
                  <span>{t("guideStep2")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-muted text-[10px] font-bold text-foreground">
                    3
                  </span>
                  <span>{t("guideStep3")}</span>
                </div>
              </div>
            </Card>
            </motion.div>
          )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
