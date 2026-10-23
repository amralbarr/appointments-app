import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { backendFetch, isSafePathSegment } from "@/lib/backend";
import type { BookingWithSlot } from "@/lib/types";
import { ManageBookingClient } from "./manage-booking-client";

// Server Component: the one durable, revisitable way a customer can
// manage a booking later, not just in the same browser session they
// created it in (that in-session case is already handled inline on the
// tenant page's own confirmation screen). Reached only via a link
// containing both bookingId and cancelToken - there's no lookup-by-email
// anywhere in this app, deliberately (see backend/docs/API.md on why
// email was never treated as a secret).
export default async function ManageBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ bookingId: string }>;
  searchParams: Promise<{ cancelToken?: string }>;
}) {
  const { bookingId } = await params;
  const { cancelToken } = await searchParams;
  const t = await getTranslations("bookingFlow");

  if (!isSafePathSegment(bookingId)) notFound();

  if (!cancelToken) {
    return (
      <NoticeWrapper>
        <NoticeCard
          title={t("managePageMissingTokenTitle")}
          body={t("managePageMissingTokenBody")}
        />
      </NoticeWrapper>
    );
  }

  const res = await backendFetch(`bookings/${bookingId}`, {
    searchParams: { cancelToken },
  });

  if (res.status === 404) {
    return (
      <NoticeWrapper>
        <NoticeCard title={t("managePageNotFoundTitle")} body={t("managePageNotFoundBody")} />
      </NoticeWrapper>
    );
  }

  const booking = (await res.json()) as BookingWithSlot;

  return (
    <div className="min-h-full bg-background pb-16">
      <div className="mx-auto max-w-xl px-4 pt-10 sm:px-6">
        <ManageBookingClient booking={booking} cancelToken={cancelToken} />
      </div>
    </div>
  );
}

function NoticeWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-background pb-16">
      <div className="mx-auto max-w-xl px-4 pt-10 sm:px-6">{children}</div>
    </div>
  );
}

function NoticeCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs">
      <h1 className="text-lg font-semibold text-foreground">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}
