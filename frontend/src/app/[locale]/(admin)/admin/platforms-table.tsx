"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Search,
  Building2,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Loader2,
  Filter,
  Trash2,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { Platform } from "@/lib/types";
import { localizedField } from "@/lib/locale-content";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/avatar";

export function PlatformsTable({ initialPlatforms }: { initialPlatforms: Platform[] }) {
  const t = useTranslations("admin");
  const locale = useLocale();
  const [platforms, setPlatforms] = useState(initialPlatforms);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "SUSPENDED">("ALL");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stats = useMemo(() => {
    let active = 0;
    let suspended = 0;
    for (const p of platforms) {
      if (p.isActive) active++;
      else suspended++;
    }
    return { total: platforms.length, active, suspended };
  }, [platforms]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return platforms.filter((p) => {
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.nameAr?.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q);
      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ACTIVE" && p.isActive) ||
        (statusFilter === "SUSPENDED" && !p.isActive);
      return matchesSearch && matchesStatus;
    });
  }, [platforms, search, statusFilter]);

  async function toggle(platform: Platform) {
    setError(null);
    setUpdatingId(platform.id);

    try {
      const res = await fetch(`/api/admin/platforms/${platform.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !platform.isActive }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.message ?? t("statusUpdateError"));
        return;
      }
      setPlatforms((prev) => prev.map((p) => (p.id === platform.id ? body : p)));
    } catch {
      setError(t("statusUpdateErrorUnexpected"));
    } finally {
      setUpdatingId(null);
    }
  }

  async function remove(platform: Platform) {
    setError(null);
    setDeletingId(platform.id);

    try {
      const res = await fetch(`/api/admin/platforms/${platform.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.message ?? t("deleteError"));
        return;
      }
      setPlatforms((prev) => prev.filter((p) => p.id !== platform.id));
    } catch {
      setError(t("deleteErrorUnexpected"));
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-500/10 text-purple-600">
            <Building2 size={22} />
          </div>
          <div>
            <div className="text-2xl font-bold tracking-tight text-foreground">{stats.total}</div>
            <div className="text-xs font-medium text-muted-foreground">{t("totalPlatforms")}</div>
          </div>
        </Card>

        <Card className="p-5 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-success-subtle text-success">
            <CheckCircle2 size={22} />
          </div>
          <div>
            <div className="text-2xl font-bold tracking-tight text-foreground">{stats.active}</div>
            <div className="text-xs font-medium text-muted-foreground">{t("activeBookable")}</div>
          </div>
        </Card>

        <Card className="p-5 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-danger-subtle text-danger">
            <AlertTriangle size={22} />
          </div>
          <div>
            <div className="text-2xl font-bold tracking-tight text-foreground">{stats.suspended}</div>
            <div className="text-xs font-medium text-muted-foreground">{t("suspendedInactive")}</div>
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
            placeholder={t("searchPlatformsPlaceholder")}
            className="w-full rounded-xl border border-border bg-surface py-2 ps-9 pe-3 text-xs text-foreground placeholder:text-subtle-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground me-1 flex items-center gap-1">
            <Filter size={12} />
            <span>{t("statusLabel")}</span>
          </span>
          {(["ALL", "ACTIVE", "SUSPENDED"] as const).map((st) => (
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
              {st === "ALL" ? t("filterAll") : st === "ACTIVE" ? t("filterActive") : t("filterSuspended")}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-2xl border border-danger/20 bg-danger-subtle p-3 text-xs text-danger">
          <AlertTriangle size={15} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Table */}
      {filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center p-12 text-center border-dashed">
          <Building2 className="mb-2 text-muted-foreground" size={24} />
          <h3 className="text-sm font-bold text-foreground">{t("noPlatformsFoundTitle")}</h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-xs">
            {search ? t("noPlatformsFoundFiltered", { search }) : t("noPlatformsFoundEmpty")}
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden border-border bg-surface shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-start text-xs">
              <thead>
                <tr className="border-b border-border bg-surface-muted/60 text-muted-foreground uppercase tracking-wider text-[11px] font-semibold">
                  <th className="px-5 py-3">{t("columnPlatform")}</th>
                  <th className="px-5 py-3">{t("columnPublicRoute")}</th>
                  <th className="px-5 py-3">{t("columnStatus")}</th>
                  <th className="px-5 py-3 text-end">{t("columnActions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((p) => {
                  const isBusy = updatingId === p.id;
                  const displayName = localizedField(locale, p.name, p.nameAr) ?? p.name;
                  const displayDescription = localizedField(locale, p.description, p.descriptionAr);
                  return (
                    <tr key={p.id} className="transition-colors hover:bg-surface-muted/40">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <Avatar name={displayName} logoUrl={p.logoUrl} size={36} />
                          <div>
                            <div className="font-bold text-foreground">{displayName}</div>
                            {displayDescription && (
                              <div className="mt-0.5 max-w-xs truncate text-[11px] text-muted-foreground">
                                {displayDescription}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-3.5">
                        <Link
                          href={`/${p.slug}`}
                          target="_blank"
                          className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
                        >
                          <span>/{p.slug}</span>
                          <ExternalLink size={11} />
                        </Link>
                      </td>

                      <td className="px-5 py-3.5">
                        <Badge variant={p.isActive ? "success" : "danger"} size="sm">
                          {p.isActive ? (
                            <>
                              <CheckCircle2 size={12} />
                              <span>{t("filterActive")}</span>
                            </>
                          ) : (
                            <>
                              <AlertTriangle size={12} />
                              <span>{t("filterSuspended")}</span>
                            </>
                          )}
                        </Badge>
                      </td>

                      <td className="px-5 py-3.5 text-end">
                        {confirmDeleteId === p.id ? (
                          <div className="flex flex-col items-end gap-1.5">
                            <span className="max-w-[220px] text-[11px] text-danger">
                              {t("confirmDeleteBody", { name: displayName })}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={deletingId === p.id}
                                onClick={() => remove(p)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-danger px-3 py-1 text-xs font-semibold text-danger-foreground transition-colors hover:bg-danger-hover disabled:opacity-50"
                              >
                                {deletingId === p.id && <Loader2 size={12} className="animate-spin" />}
                                <span>{t("confirmDeleteYes")}</span>
                              </button>
                              <button
                                type="button"
                                disabled={deletingId === p.id}
                                onClick={() => setConfirmDeleteId(null)}
                                className="rounded-lg border border-border px-3 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
                              >
                                {t("confirmDeleteCancel")}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => toggle(p)}
                              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-50 ${
                                p.isActive
                                  ? "border-danger/30 text-danger hover:bg-danger-subtle hover:text-danger"
                                  : "border-success/30 text-success hover:bg-success-subtle hover:text-success"
                              }`}
                            >
                              {isBusy && <Loader2 size={12} className="animate-spin" />}
                              <span>{p.isActive ? t("suspendAction") : t("reactivateAction")}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(p.id)}
                              aria-label={t("deleteAction")}
                              title={t("deleteAction")}
                              className="inline-flex items-center justify-center rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:border-danger/30 hover:bg-danger-subtle hover:text-danger"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
