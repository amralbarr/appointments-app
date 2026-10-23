"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Scissors, Clock, Plus, Trash2, AlertCircle, Pencil, Check, X } from "lucide-react";
import type { Service } from "@/lib/types";
import { localizedField } from "@/lib/locale-content";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const PRESET_DURATIONS = [15, 30, 45, 60, 90];

export function ServicesManager({
  platformId,
  initialServices,
}: {
  platformId: string;
  initialServices: Service[];
}) {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const [services, setServices] = useState(initialServices);
  const [name, setName] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editNameAr, setEditNameAr] = useState("");
  const [editDuration, setEditDuration] = useState(30);
  const [savingId, setSavingId] = useState<string | null>(null);

  function startEdit(s: Service) {
    setEditingId(s.id);
    setEditName(s.name);
    setEditNameAr(s.nameAr ?? "");
    setEditDuration(s.durationMinutes);
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function handleUpdate(serviceId: string) {
    setError(null);
    setSavingId(serviceId);
    try {
      const res = await fetch(`/api/dashboard/platforms/${platformId}/services/${serviceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, nameAr: editNameAr || undefined, durationMinutes: editDuration }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.message ?? t("serviceUpdateError"));
        return;
      }
      setServices((prev) => prev.map((s) => (s.id === serviceId ? body : s)));
      setEditingId(null);
    } catch {
      setError(t("serviceUpdateErrorUnexpected"));
    } finally {
      setSavingId(null);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);

    try {
      const res = await fetch(`/api/dashboard/platforms/${platformId}/services`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, nameAr: nameAr || undefined, durationMinutes }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.message ?? t("serviceCreateError"));
        return;
      }
      setServices((prev) => [...prev, body]);
      setName("");
      setNameAr("");
      setDurationMinutes(30);
    } catch {
      setError(t("serviceCreateErrorUnexpected"));
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(serviceId: string) {
    setError(null);
    setDeletingId(serviceId);

    try {
      const res = await fetch(`/api/dashboard/platforms/${platformId}/services/${serviceId}`, {
        method: "DELETE",
      });
      if (res.ok || res.status === 204) {
        setServices((prev) => prev.filter((s) => s.id !== serviceId));
      } else {
        const body = await res.json().catch(() => null);
        setError(body?.message ?? t("serviceDeleteError"));
      }
    } catch {
      setError(t("serviceDeleteErrorUnexpected"));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-12 items-start max-w-5xl">
      {/* Services List Column */}
      <div className="space-y-4 lg:col-span-7">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
              {t("currentOfferings")}
            </h2>
            <Badge variant="primary" size="sm">
              {services.length}
            </Badge>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-2xl border border-danger/20 bg-danger-subtle p-3 text-xs text-danger">
            <AlertCircle size={15} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {services.length === 0 ? (
          <Card className="flex flex-col items-center justify-center p-8 text-center border-dashed">
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-surface-muted text-muted-foreground">
              <Scissors size={20} />
            </div>
            <h3 className="text-sm font-bold text-foreground">{t("noServicesTitle")}</h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-xs">{t("noServicesDesc")}</p>
          </Card>
        ) : (
          <div className="space-y-2.5">
            {services.map((s) => (
              <Card
                key={s.id}
                className="p-4 transition-all duration-150 hover:border-primary/40 hover:shadow-xs"
              >
                {editingId === s.id ? (
                  /* Inline edit form */
                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label htmlFor={`edit-name-${s.id}`}>{t("serviceNameLabel")}</Label>
                        <Input
                          id={`edit-name-${s.id}`}
                          required
                          minLength={2}
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder={t("serviceNamePlaceholder")}
                        />
                      </div>
                      <div>
                        <Label htmlFor={`edit-name-ar-${s.id}`}>{t("serviceNameArLabel")}</Label>
                        <Input
                          id={`edit-name-ar-${s.id}`}
                          dir="rtl"
                          value={editNameAr}
                          onChange={(e) => setEditNameAr(e.target.value)}
                          placeholder={t("serviceNameArPlaceholder")}
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor={`edit-dur-${s.id}`}>{t("serviceDurationLabel")}</Label>
                      <Input
                        id={`edit-dur-${s.id}`}
                        type="number"
                        min={5}
                        value={editDuration}
                        onChange={(e) => setEditDuration(Number(e.target.value))}
                        className="w-28"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleUpdate(s.id)}
                        disabled={savingId === s.id}
                        className="flex items-center gap-1.5 rounded-lg border border-success/30 bg-success-subtle px-3 py-1.5 text-xs font-semibold text-success transition-colors hover:bg-success/10 disabled:opacity-50"
                        title={t("saveServiceTitle")}
                      >
                        <Check size={13} />
                        {t("saveServiceTitle")}
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-surface-muted"
                        title={t("cancelEditTitle")}
                      >
                        <X size={13} />
                        {t("cancelEditTitle")}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Read-only view */
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-subtle text-primary">
                        <Scissors size={16} />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-foreground">
                          {localizedField(locale, s.name, s.nameAr) ?? s.name}
                        </h3>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Clock size={12} />
                          <span>{t("minutesStandardDuration", { minutes: s.durationMinutes })}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(s)}
                        className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-surface-muted hover:text-primary"
                        title={t("editServiceTitle")}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(s.id)}
                        disabled={deletingId === s.id}
                        className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-danger-subtle hover:text-danger disabled:opacity-50"
                        title={t("deleteServiceTitle")}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Add New Service Column */}
      <div className="lg:col-span-5">
        <Card className="border-border bg-surface shadow-xs">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Plus size={18} className="text-primary" />
              <CardTitle>{t("addNewService")}</CardTitle>
            </div>
            <CardDescription>{t("addNewServiceDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label htmlFor="service-name">{t("serviceNameLabel")}</Label>
                <Input
                  id="service-name"
                  required
                  minLength={2}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("serviceNamePlaceholder")}
                />
              </div>

              <div>
                <Label htmlFor="service-name-ar">{t("serviceNameArLabel")}</Label>
                <Input
                  id="service-name-ar"
                  dir="rtl"
                  value={nameAr}
                  onChange={(e) => setNameAr(e.target.value)}
                  placeholder={t("serviceNameArPlaceholder")}
                />
              </div>

              <div>
                <Label htmlFor="service-minutes">{t("serviceDurationLabel")}</Label>
                <Input
                  id="service-minutes"
                  required
                  type="number"
                  min={5}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                />
                {/* Duration Presets */}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {PRESET_DURATIONS.map((dur) => (
                    <button
                      key={dur}
                      type="button"
                      onClick={() => setDurationMinutes(dur)}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
                        durationMinutes === dur
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-surface text-muted-foreground hover:bg-surface-muted"
                      }`}
                    >
                      {dur}m
                    </button>
                  ))}
                </div>
              </div>

              <Button type="submit" loading={creating} className="w-full">
                <Plus size={16} />
                <span>{creating ? t("addingService") : t("addServiceButton")}</span>
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
