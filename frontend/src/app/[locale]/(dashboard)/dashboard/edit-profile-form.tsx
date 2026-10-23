"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Building2,
  Image as ImageIcon,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Save,
  Languages,
  ShieldCheck,
} from "lucide-react";
import type { Platform, WeekDay } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Avatar } from "@/components/avatar";

const WEEKDAYS: WeekDay[] = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export function EditProfileForm({ platform }: { platform: Platform }) {
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");

  const [name, setName] = useState(platform.name || "");
  const [description, setDescription] = useState(platform.description || "");
  const [logoUrl, setLogoUrl] = useState(platform.logoUrl || "");
  const [coverImageUrl, setCoverImageUrl] = useState(platform.coverImageUrl || "");
  const [address, setAddress] = useState(platform.address || "");
  const [phone, setPhone] = useState(platform.phone || "");
  const [businessHoursText, setBusinessHoursText] = useState(platform.businessHoursText || "");

  // Arabic counterparts — all nullable, same "|| ''" null-handling as the
  // English fields above.
  const [nameAr, setNameAr] = useState(platform.nameAr || "");
  const [descriptionAr, setDescriptionAr] = useState(platform.descriptionAr || "");
  const [businessHoursTextAr, setBusinessHoursTextAr] = useState(platform.businessHoursTextAr || "");

  // Structured working-hours data, alongside the two human-readable
  // businessHoursText/businessHoursTextAr display strings above.
  const [workingDays, setWorkingDays] = useState<WeekDay[]>(platform.workingDays || []);
  const [openTime, setOpenTime] = useState(platform.openTime || "");
  const [closeTime, setCloseTime] = useState(platform.closeTime || "");

  // off by default on every platform (schema's own @default(false)) -
  // this is the one real place a tenant turns it on.
  const [customerCancellationEnabled, setCustomerCancellationEnabled] = useState(
    platform.customerCancellationEnabled,
  );

  // default 1 (schema's own @default(1)) - how many customers can hold
  // the same time+service simultaneously (a barbershop with several
  // chairs). Kept as a raw string while editing so the input can be
  // briefly empty mid-edit; coerced back to a real number on submit.
  const [seats, setSeats] = useState(String(platform.seats ?? 1));

  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function toggleDay(day: WeekDay) {
    setWorkingDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSaved(false);

    const values = {
      name,
      description,
      logoUrl,
      coverImageUrl,
      address,
      phone,
      businessHoursText,
      nameAr,
      descriptionAr,
      businessHoursTextAr,
      workingDays,
      openTime: openTime || null,
      closeTime: closeTime || null,
      customerCancellationEnabled,
      seats: Math.min(20, Math.max(1, Number(seats) || 1)),
    };

    try {
      const res = await fetch(`/api/dashboard/platforms/${platform.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.message ?? t("saveErrorFallback"));
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
    } catch {
      setError(t("saveErrorUnexpected"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">
      {saved && (
        <div className="flex items-center gap-2 rounded-2xl border border-success/20 bg-success-subtle p-4 text-xs font-semibold text-success shadow-xs">
          <CheckCircle2 size={16} className="shrink-0" />
          <span>{t("savedNotice")}</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-2xl border border-danger/20 bg-danger-subtle p-4 text-xs font-semibold text-danger shadow-xs">
          <AlertCircle size={16} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Section 1: Business Details */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 size={18} className="text-primary" />
            <CardTitle>{t("businessOverview")}</CardTitle>
          </div>
          <CardDescription>{t("businessOverviewDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="biz-name">{t("businessName")}</Label>
              <Input
                id="biz-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("businessNamePlaceholder")}
              />
            </div>

            <div>
              <Label htmlFor="biz-slug">{t("slugLabel")}</Label>
              <div className="relative">
                <Input
                  id="biz-slug"
                  disabled
                  value={`/${platform.slug}`}
                  className="bg-surface-muted text-muted-foreground font-mono"
                />
              </div>
              <p className="mt-1 text-[11px] text-subtle-foreground">{t("slugNote")}</p>
            </div>
          </div>

          <div>
            <Label htmlFor="biz-desc">{t("publicDescription")}</Label>
            <Textarea
              id="biz-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("publicDescriptionPlaceholder")}
            />
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Arabic Content */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Languages size={18} className="text-primary" />
            <CardTitle>{t("arabicContentTitle")}</CardTitle>
          </div>
          <CardDescription>{t("arabicContentDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="biz-name-ar">{t("nameArLabel")}</Label>
            <Input
              id="biz-name-ar"
              dir="rtl"
              value={nameAr}
              onChange={(e) => setNameAr(e.target.value)}
              placeholder={t("nameArPlaceholder")}
            />
          </div>

          <div>
            <Label htmlFor="biz-desc-ar">{t("descriptionArLabel")}</Label>
            <Textarea
              id="biz-desc-ar"
              dir="rtl"
              rows={3}
              value={descriptionAr}
              onChange={(e) => setDescriptionAr(e.target.value)}
              placeholder={t("descriptionArPlaceholder")}
            />
          </div>

          <div>
            <Label htmlFor="biz-hours-ar">{t("hoursArLabel")}</Label>
            <Textarea
              id="biz-hours-ar"
              dir="rtl"
              rows={2}
              value={businessHoursTextAr}
              onChange={(e) => setBusinessHoursTextAr(e.target.value)}
              placeholder={t("hoursArPlaceholder")}
            />
          </div>
        </CardContent>
      </Card>

      {/* Section 3: Visual Branding */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ImageIcon size={18} className="text-primary" />
            <CardTitle>{t("mediaBranding")}</CardTitle>
          </div>
          <CardDescription>{t("mediaBrandingDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <Label htmlFor="biz-logo">{t("logoUrl")}</Label>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <Avatar name={name || "B"} logoUrl={logoUrl} size={48} />
              <Input
                id="biz-logo"
                type="url"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://example.com/logo.png"
                className="flex-1"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="biz-cover">{t("coverImageUrl")}</Label>
            <Input
              id="biz-cover"
              type="url"
              value={coverImageUrl}
              onChange={(e) => setCoverImageUrl(e.target.value)}
              placeholder="https://example.com/cover-banner.jpg"
            />
            {coverImageUrl && (
              <div className="mt-3 relative h-28 w-full overflow-hidden rounded-xl border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={coverImageUrl}
                  alt="Cover preview"
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLElement).style.display = "none";
                  }}
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Section 4: Contact & Operating Hours */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <MapPin size={18} className="text-primary" />
            <CardTitle>{t("locationHours")}</CardTitle>
          </div>
          <CardDescription>{t("locationHoursDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="biz-address">{t("addressLabel")}</Label>
              <Input
                id="biz-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={t("addressPlaceholder")}
              />
            </div>

            <div>
              <Label htmlFor="biz-phone">{t("phoneLabel")}</Label>
              <Input
                id="biz-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={t("phonePlaceholder")}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="biz-hours">{t("businessHoursText")}</Label>
            <Textarea
              id="biz-hours"
              rows={2}
              value={businessHoursText}
              onChange={(e) => setBusinessHoursText(e.target.value)}
              placeholder={t("businessHoursTextPlaceholder")}
            />
          </div>

          {/* Structured working-days + open/close time editor */}
          <div className="rounded-2xl border border-border bg-surface-muted/40 p-4 space-y-3">
            <div>
              <Label>{t("workingDaysLabel")}</Label>
              <p className="mb-2 text-[11px] text-subtle-foreground">{t("workingDaysNote")}</p>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((day) => {
                  const active = workingDays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(day)}
                      aria-pressed={active}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
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

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="biz-open-time">{t("openTimeLabel")}</Label>
                <Input
                  id="biz-open-time"
                  type="time"
                  value={openTime}
                  onChange={(e) => setOpenTime(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="biz-close-time">{t("closeTimeLabel")}</Label>
                <Input
                  id="biz-close-time"
                  type="time"
                  value={closeTime}
                  onChange={(e) => setCloseTime(e.target.value)}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 5: Booking Policies */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-primary" />
            <CardTitle>{t("bookingPoliciesTitle")}</CardTitle>
          </div>
          <CardDescription>{t("bookingPoliciesDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start justify-between gap-4 rounded-2xl border border-border bg-surface-muted/40 p-4">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {t("customerCancellationLabel")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                {t("customerCancellationDesc")}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={customerCancellationEnabled}
              aria-label={t("customerCancellationLabel")}
              onClick={() => setCustomerCancellationEnabled((v) => !v)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                customerCancellationEnabled ? "bg-primary" : "bg-border-strong"
              }`}
            >
              <span
                className={`inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow-xs transition-transform ${
                  customerCancellationEnabled
                    ? "translate-x-[22px] rtl:-translate-x-[22px]"
                    : "translate-x-1 rtl:-translate-x-1"
                }`}
              />
            </button>
          </div>

          <div className="mt-4 flex items-start justify-between gap-4 rounded-2xl border border-border bg-surface-muted/40 p-4">
            <div>
              <p className="text-sm font-semibold text-foreground">{t("seatsLabel")}</p>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{t("seatsDesc")}</p>
            </div>
            <Input
              id="seats"
              type="number"
              min={1}
              max={20}
              value={seats}
              onChange={(e) => setSeats(e.target.value)}
              className="w-20 text-center"
            />
          </div>
        </CardContent>
      </Card>

      {/* Submit footer */}
      <div className="flex items-center justify-between border-t border-border pt-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Sparkles size={14} className="text-primary" />
          <span>{t("saveFooterNote")}</span>
        </div>

        <Button type="submit" loading={submitting} size="lg" className="px-6">
          <Save size={16} />
          <span>{submitting ? tc("saving") : tc("save")}</span>
        </Button>
      </div>
    </form>
  );
}
