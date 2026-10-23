/**
 * Shared utility for generating "add to calendar" links and file downloads.
 * Consumed by public-booking-page (primary) and manage-booking (secondary).
 * No external dependencies required — browser-native APIs only.
 */

interface CalendarEventParams {
  startsAt: string; // ISO 8601
  endsAt: string; // ISO 8601
  title: string;
  description?: string;
  location?: string;
}

/**
 * Formats a Date as YYYYMMDDTHHmmssZ (UTC, no separators) for Google Calendar.
 */
function toGoogleCalendarDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

/**
 * Returns a Google Calendar "add event" URL.
 * Opens in a new tab — no download, no file write.
 */
export function buildGoogleCalendarUrl({
  startsAt,
  endsAt,
  title,
  description,
  location,
}: CalendarEventParams): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${toGoogleCalendarDate(startsAt)}/${toGoogleCalendarDate(endsAt)}`,
  });
  if (description) params.set("details", description);
  if (location) params.set("location", location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Returns a Blob containing a valid VCALENDAR (ICS) string.
 * The caller triggers the browser download via a temporary object URL.
 */
export function buildIcsBlob({
  startsAt,
  endsAt,
  title,
  description,
  location,
}: CalendarEventParams): Blob {
  const formatIcsDate = (iso: string): string => toGoogleCalendarDate(iso);
  const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}@appointments-app`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Appointments App//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${formatIcsDate(new Date().toISOString())}`,
    `DTSTART:${formatIcsDate(startsAt)}`,
    `DTEND:${formatIcsDate(endsAt)}`,
    `SUMMARY:${escape(title)}`,
    description ? `DESCRIPTION:${escape(description)}` : null,
    location ? `LOCATION:${escape(location)}` : null,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");

  return new Blob([lines], { type: "text/calendar;charset=utf-8" });
}
