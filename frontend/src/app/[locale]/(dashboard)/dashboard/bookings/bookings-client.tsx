"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Search,
  CheckCircle2,
  XCircle,
  Calendar,
  Clock,
  Filter,
} from "lucide-react";
import type { Booking } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function BookingsClient({ bookings }: { bookings: Booking[] }) {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "CONFIRMED" | "CANCELLED">("ALL");

  const counts = useMemo(() => {
    let confirmed = 0;
    let cancelled = 0;
    for (const b of bookings) {
      if (b.status === "CONFIRMED") confirmed++;
      else if (b.status === "CANCELLED") cancelled++;
    }
    return { total: bookings.length, confirmed, cancelled };
  }, [bookings]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bookings.filter((b) => {
      const matchSearch =
        !q ||
        b.customerName.toLowerCase().includes(q) ||
        b.customerEmail.toLowerCase().includes(q);
      const matchStatus = statusFilter === "ALL" || b.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [bookings, search, statusFilter]);

  return (
    <div className="space-y-6">
      {/* Metric summary stat cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-subtle text-primary">
            <Calendar size={22} />
          </div>
          <div>
            <div className="text-2xl font-bold tracking-tight text-foreground">{counts.total}</div>
            <div className="text-xs font-medium text-muted-foreground">{t("totalBookings")}</div>
          </div>
        </Card>

        <Card className="p-5 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-success-subtle text-success">
            <CheckCircle2 size={22} />
          </div>
          <div>
            <div className="text-2xl font-bold tracking-tight text-foreground">{counts.confirmed}</div>
            <div className="text-xs font-medium text-muted-foreground">{t("confirmedBookings")}</div>
          </div>
        </Card>

        <Card className="p-5 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-danger-subtle text-danger">
            <XCircle size={22} />
          </div>
          <div>
            <div className="text-2xl font-bold tracking-tight text-foreground">{counts.cancelled}</div>
            <div className="text-xs font-medium text-muted-foreground">{t("cancelledBookings")}</div>
          </div>
        </Card>
      </div>

      {/* Filter and Search controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <Search size={15} className="absolute start-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchCustomerPlaceholder")}
            className="w-full rounded-xl border border-border bg-surface py-2 ps-9 pe-3 text-xs text-foreground placeholder:text-subtle-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground me-1 flex items-center gap-1">
            <Filter size={12} />
            <span>{t("statusLabel")}</span>
          </span>
          {(["ALL", "CONFIRMED", "CANCELLED"] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                statusFilter === st
                  ? "bg-foreground text-background font-semibold"
                  : "bg-surface border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {st === "ALL" ? t("filterAllLabel") : st === "CONFIRMED" ? t("filterConfirmed") : t("filterCancelled")}
            </button>
          ))}
        </div>
      </div>

      {/* Bookings Table / List */}
      {filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center border-dashed">
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-surface-muted text-muted-foreground">
            <Calendar size={20} />
          </div>
          <h3 className="text-sm font-bold text-foreground">{t("noBookingsFoundTitle")}</h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-xs">
            {search || statusFilter !== "ALL" ? t("noBookingsFilteredDesc") : t("noBookingsEmptyDesc")}
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden border-border bg-surface shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-start text-xs">
              <thead>
                <tr className="border-b border-border bg-surface-muted/60 text-muted-foreground uppercase tracking-wider text-[11px] font-semibold">
                  <th className="px-5 py-3">{t("columnCustomer")}</th>
                  <th className="px-5 py-3">{t("columnEmail")}</th>
                  <th className="px-5 py-3">{t("columnStatus")}</th>
                  <th className="px-5 py-3">{t("columnCreated")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((b) => (
                  <tr key={b.id} className="transition-colors hover:bg-surface-muted/40">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-subtle font-bold text-primary text-xs">
                          {b.customerName.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-semibold text-foreground">{b.customerName}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-muted-foreground">
                      {b.customerEmail}
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge
                        variant={b.status === "CONFIRMED" ? "success" : "danger"}
                        size="sm"
                      >
                        {b.status === "CONFIRMED" ? (
                          <>
                            <CheckCircle2 size={12} />
                            <span>{t("filterConfirmed")}</span>
                          </>
                        ) : (
                          <>
                            <XCircle size={12} />
                            <span>{t("filterCancelled")}</span>
                          </>
                        )}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Clock size={12} />
                        <span>
                          {new Date(b.createdAt).toLocaleString(locale, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
