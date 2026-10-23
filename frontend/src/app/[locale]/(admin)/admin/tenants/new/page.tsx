"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  UserPlus,
  ArrowLeft,
  ArrowRight,
  Mail,
  User,
  Building2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  KeyRound,
  RotateCcw,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { CopyButton } from "@/components/copy-button";

export default function CreateTenantPage() {
  const t = useTranslations("admin");
  const locale = useLocale();
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [platformName, setPlatformName] = useState("");
  const [result, setResult] = useState<{
    platform: { name: string; slug: string };
    owner: { email: string };
    initialPassword?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/platforms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerEmail, ownerName: ownerName || undefined, platformName }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.message ?? t("createError"));
        return;
      }
      setResult(body);
    } catch {
      setError(t("createErrorUnexpected"));
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setResult(null);
    setOwnerEmail("");
    setOwnerName("");
    setPlatformName("");
    setError(null);
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Back button */}
      <div>
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          {locale === "ar" ? <ArrowRight size={13} /> : <ArrowLeft size={13} />}
          <span>{t("backToDirectory")}</span>
        </Link>
      </div>

      {result ? (
        /* Provisioning Success Certificate / Voucher */
        <Card className="overflow-hidden border-border bg-surface shadow-md">
          <div className="bg-success-subtle border-b border-success/20 p-6 text-center text-success">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface shadow-xs">
              <CheckCircle2 size={28} />
            </div>
            <h2 className="text-xl font-bold">{t("successTitle")}</h2>
            <p className="mt-1 text-xs opacity-90">
              {t("successDesc")}
            </p>
          </div>

          <div className="p-6 space-y-5">
            {/* Platform Details Summary */}
            <div className="rounded-2xl border border-border bg-surface-muted/60 p-4 space-y-2.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">{t("platformNameSummary")}</span>
                <span className="font-bold text-foreground text-sm">{result.platform.name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">{t("publicUrlRouteSummary")}</span>
                <Link
                  href={`/${result.platform.slug}`}
                  target="_blank"
                  className="font-mono text-primary flex items-center gap-1 hover:underline"
                >
                  <span>/{result.platform.slug}</span>
                  <ExternalLink size={12} />
                </Link>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">{t("ownerEmailSummary")}</span>
                <span className="font-semibold text-foreground">{result.owner.email}</span>
              </div>
            </div>

            {result.initialPassword ? (
              /* One-time initial password box */
              <div className="rounded-2xl border border-warning-border bg-warning-subtle p-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                    <KeyRound size={14} />
                    {t("initialPasswordTitle")}
                  </span>
                  <CopyButton text={result.initialPassword} label={t("copyPassword")} />
                </div>
                <p className="text-xs text-amber-800 leading-relaxed mb-2">
                  {t("initialPasswordDesc")}
                </p>
                <div className="rounded-xl border border-amber-300/80 bg-surface/90 p-2.5 text-center">
                  <code className="font-mono text-sm font-bold tracking-wider text-foreground">
                    {result.initialPassword}
                  </code>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-border bg-surface-muted p-4 text-xs text-muted-foreground">
                {t("existingOwnerNotice")}
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
              <Button variant="secondary" size="md" onClick={handleReset} className="w-full">
                <RotateCcw size={14} className="me-1.5" />
                {t("provisionAnother")}
              </Button>
              <Link href="/admin" className="w-full">
                <Button variant="primary" size="md" className="w-full">
                  {t("returnToDirectory")}
                </Button>
              </Link>
            </div>
          </div>
        </Card>
      ) : (
        /* Provisioning Form */
        <Card className="border-border bg-surface shadow-xs">
          <CardHeader>
            <div className="flex items-center gap-2">
              <UserPlus size={18} className="text-primary" />
              <CardTitle>{t("createTenantTitle")}</CardTitle>
            </div>
            <CardDescription>
              {t("createTenantDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="platformName" className="flex items-center gap-1.5">
                  <Building2 size={13} className="text-muted-foreground" />
                  <span>{t("platformNameLabel")}</span>
                </Label>
                <Input
                  id="platformName"
                  required
                  minLength={2}
                  value={platformName}
                  onChange={(e) => setPlatformName(e.target.value)}
                  placeholder={t("platformNamePlaceholder")}
                />
              </div>

              <div>
                <Label htmlFor="ownerEmail" className="flex items-center gap-1.5">
                  <Mail size={13} className="text-muted-foreground" />
                  <span>{t("ownerEmailLabel")}</span>
                </Label>
                <Input
                  id="ownerEmail"
                  required
                  type="email"
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                  placeholder={t("ownerEmailPlaceholder")}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t("ownerEmailNote")}
                </p>
              </div>

              <div>
                <Label htmlFor="ownerName" className="flex items-center gap-1.5">
                  <User size={13} className="text-muted-foreground" />
                  <span>{t("ownerNameLabel")}</span>
                </Label>
                <Input
                  id="ownerName"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder={t("ownerNamePlaceholder")}
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-2xl border border-danger/20 bg-danger-subtle p-3 text-xs text-danger">
                  <AlertCircle size={15} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button type="submit" loading={submitting} size="lg" className="w-full">
                {submitting ? t("creatingPlatform") : t("provisionButton")}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
