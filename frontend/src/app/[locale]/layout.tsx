import type { Metadata } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import "../globals.css";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isArabic = locale === "ar";
  return {
    title: isArabic
      ? "مواعيد | Appointments Platform"
      : "Appointments | Smart Booking Platform",
    description: isArabic
      ? "منصة حجز المواعيد الذكية متعددة المستأجرين مع مساعد الذكاء الاصطناعي — احجز موعدك بسهولة عبر المحادثة الذكية."
      : "Intelligent multi-tenant booking platform with a conversational AI assistant — book your appointment easily through chat.",
    icons: {
      icon: "/favicon.ico",
    },
  };
}

// This is the app's real root layout (the only one with <html>/<body>) —
// there is no separate app/layout.tsx. Every page lives under
// app/[locale]/... (app/api/** route handlers don't render HTML and sit
// outside this segment entirely), so next-intl's own recommended
// with-i18n-routing structure applies: the locale segment's own layout is
// the de facto application root.
export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  const messages = await getMessages();
  const dir = locale === "ar" ? "rtl" : "ltr";

  return (
    <html lang={locale} dir={dir} className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap"
        />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
