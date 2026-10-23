"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, Link } from "@/i18n/navigation";
import { Calendar, Lock, Mail, Eye, EyeOff, ArrowLeft, ArrowRight, Shield, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";

export default function LoginPage() {
  const t = useTranslations("login");
  const locale = useLocale();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.message ?? t("invalidCredentials"));
        return;
      }
      router.push(body.role === "ADMIN" ? "/admin" : "/dashboard");
      router.refresh();
    } catch {
      setError(t("unexpectedError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen flex flex-col justify-center items-center bg-background px-4 py-12 sm:px-6">
      {/* Background ambient pattern */}
      <div className="pointer-events-none absolute inset-0 bg-grid-pattern opacity-40" />

      {/* Top Navigation Back Link */}
      <div className="mb-6 w-full max-w-md">
        <Link
          href="/list"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          {locale === "ar" ? <ArrowRight size={14} /> : <ArrowLeft size={14} />}
          <span>{t("backToDirectory")}</span>
        </Link>
      </div>

      <Card className="relative w-full max-w-md overflow-hidden border-border bg-surface p-6 sm:p-8 shadow-xl">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/25">
              <Calendar size={22} strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground">
                {t("title")}
              </h1>
              <p className="text-xs text-muted-foreground">
                {t("subtitle")}
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="email" className="flex items-center gap-1.5">
              <Mail size={13} className="text-muted-foreground" />
              <span>{t("emailLabel")}</span>
            </Label>
            <Input
              id="email"
              required
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="password" className="flex items-center gap-1.5">
              <Lock size={13} className="text-muted-foreground" />
              <span>{t("passwordLabel")}</span>
            </Label>
            <div className="relative">
              <Input
                id="password"
                required
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pe-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute inset-y-0 end-0 flex items-center pe-3 text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? t("hidePassword") : t("showPassword")}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-danger/20 bg-danger-subtle p-3 text-xs text-danger">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <Button type="submit" loading={submitting} size="lg" className="w-full">
            {submitting ? t("submitting") : t("submit")}
          </Button>
        </form>

        {/* Security badge footer */}
        <div className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-subtle-foreground">
          <Shield size={12} />
          <span>{t("secureSession")}</span>
        </div>
      </Card>
    </div>
  );
}
