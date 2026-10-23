"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Calendar, Clock, XCircle, AlertCircle, CalendarPlus, CheckCircle2 } from "lucide-react";
import type { BookingWithSlot } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { localizedField } from "@/lib/locale-content";
import { buildGoogleCalendarUrl, buildIcsBlob } from "@/lib/calendar-link";

function formatDateTime(iso: string, locale: string) {
  return new Date(iso).toLocaleString(locale, {
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ManageBookingClient({
  booking: initialBooking,
  cancelToken,
}: {
  booking: BookingWithSlot;
  cancelToken: string;
}) {
  const t = useTranslations("bookingFlow");
  const locale = useLocale();
  const [booking, setBooking] = useState(initialBooking);
  const [cancelling, setCancelling] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCancel() {
    setCancelling(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/public/bookings/${booking.id}?cancelToken=${encodeURIComponent(cancelToken)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.message ?? t("cancelError"));
        return;
      }
      setBooking((b) => ({ ...b, status: "CANCELLED", cancelledAt: new Date().toISOString() }));
    } catch {
      setError(t("manageCancelUnexpectedError"));
    } finally {
      setCancelling(false);
      setConfirming(false);
    }
  }

  const isCancelled = booking.status === "CANCELLED";
  const serviceName =
    localizedField(locale, booking.slot.service.name, booking.slot.service.nameAr) ??
    booking.slot.service.name;

  function handleDownloadIcs() {
    const blob = buildIcsBlob({
      startsAt: booking.slot.startsAt,
      endsAt: booking.slot.endsAt,
      title: serviceName,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "appointment.ics";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  function getGoogleCalendarUrl() {
    return buildGoogleCalendarUrl({
      startsAt: booking.slot.startsAt,
      endsAt: booking.slot.endsAt,
      title: serviceName,
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isCancelled ? (
              <XCircle size={18} className="text-muted-foreground shrink-0" />
            ) : (
              <CheckCircle2 size={18} className="text-success shrink-0" />
            )}
            <CardTitle>{serviceName}</CardTitle>
          </div>
          <Badge variant={isCancelled ? "neutral" : "success"}>
            {isCancelled ? t("bookingCancelledTitle") : t("bookingConfirmedTitle")}
          </Badge>
        </div>
        <CardDescription>{t("bookedUnder", { name: booking.customerName })}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center gap-2.5 text-sm text-foreground">
          <Calendar size={16} className="text-muted-foreground" />
          {formatDateTime(booking.slot.startsAt, locale)}
        </div>
        <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
          <Clock size={16} className="text-muted-foreground" />
          {booking.slot.service.durationMinutes} min
        </div>

        {!isCancelled && (
          <div className="flex gap-2">
            <a
              href={getGoogleCalendarUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-xs font-semibold text-foreground shadow-xs transition-all duration-150 hover:border-primary/50 hover:bg-surface-muted"
            >
              <CalendarPlus size={13} />
              <span>{t("addToGoogleCalendar")}</span>
            </a>
            <button
              type="button"
              onClick={handleDownloadIcs}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border-strong bg-surface px-3 py-1.5 text-xs font-semibold text-foreground shadow-xs transition-all duration-150 hover:border-primary/50 hover:bg-surface-muted"
            >
              <CalendarPlus size={13} />
              <span>{t("downloadIcs")}</span>
            </button>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-danger/20 bg-danger-subtle p-3 text-sm text-danger">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {isCancelled ? (
          <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-muted p-3 text-sm text-muted-foreground">
            <XCircle size={16} />
            {t("bookingCancelledDesc")}
          </div>
        ) : !booking.slot.platform.customerCancellationEnabled ? (
          // off by default per platform - this business hasn't opted in
          // to customer self-service cancellation yet. Honest about why,
          // same posture as the AI chat takes when this is off - never a
          // button that would just fail if clicked.
          <div className="flex items-start gap-2 rounded-xl border border-border bg-surface-muted p-3 text-sm text-muted-foreground">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            {t("cancellationDisabledNotice")}
          </div>
        ) : confirming ? (
          <div className="space-y-2.5">
            <p className="text-sm text-foreground">{t("confirmCancelPrompt")}</p>
            <div className="flex gap-2">
              <Button variant="danger" size="sm" onClick={handleCancel} loading={cancelling}>
                {t("confirmCancelYes")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfirming(false)} disabled={cancelling}>
                {t("neverMind")}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="danger" size="sm" onClick={() => setConfirming(true)}>
            <XCircle size={14} />
            {t("cancelBookingButton")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
