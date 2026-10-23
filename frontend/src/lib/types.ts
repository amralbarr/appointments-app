// Shapes mirrored from the real backend responses (backend/src/platforms,
// services, slots, bookings) — not regenerated from the OpenAPI spec,
// same "one service per resource, no extra abstraction" posture as the
// backend itself (backend/docs/REPO-CONVENTIONS.md).

// WeekDay matches the backend's real Prisma enum (backend/prisma/schema.prisma)
// used for Platform.workingDays.
export type WeekDay = "SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT";

export interface PublicPlatform {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  description: string | null;
  logoUrl: string | null;
  coverImageUrl: string | null;
  address: string | null;
  phone: string | null;
  businessHoursText: string | null;
  // Arabic counterparts of the translatable content fields above — Arabic
  // is this platform's default locale. Never required: an existing/newly
  // created platform can have one language filled in without the other,
  // see lib/locale-content.ts for the shared viewer-locale fallback.
  nameAr: string | null;
  descriptionAr: string | null;
  businessHoursTextAr: string | null;
  // Structured working-time data, alongside the human-readable
  // businessHoursText/businessHoursTextAr display strings above. Always a
  // real array (never null, can be empty) per the backend's own
  // Platform.workingDays default([]).
  workingDays: WeekDay[];
  openTime: string | null; // "HH:mm"
  closeTime: string | null; // "HH:mm"
  // off by default - a tenant opts in from their own dashboard. Gates
  // customer-initiated cancellation only (AI chat / the standalone
  // manage-booking page), never an owner's own dashboard actions.
  customerCancellationEnabled: boolean;
  // default 1 - how many customers can hold the same time+service
  // simultaneously (a barbershop with several chairs, a salon with
  // multiple stylists). See SlotsService.ensureFutureSlots' own comment
  // for why this is `seats` parallel Slot rows, not a capacity counter.
  seats: number;
}

// Owner-facing shape (GET/PATCH /platforms/:id) — carries everything
// PublicPlatform does plus the fields only an owner/admin ever sees.
export interface Platform extends PublicPlatform {
  ownerId: string;
  isActive: boolean;
  createdAt: string;
}

export interface Service {
  id: string;
  name: string;
  nameAr: string | null;
  durationMinutes: number;
}

export interface Slot {
  id: string;
  platformId: string;
  serviceId: string;
  startsAt: string;
  endsAt: string;
  service: Service;
}

export interface Booking {
  id: string;
  slotId: string;
  platformId: string;
  customerName: string;
  customerEmail: string;
  status: "CONFIRMED" | "CANCELLED";
  createdAt: string;
  cancelledAt: string | null;
  cancelToken?: string; // present only on the create response — shown once
}

// GET /bookings/:id's own shape (customer self-service lookup) — the slot
// (and its service) included, unlike the bare Booking rows
// listForPlatform/create return, since a standalone "manage my booking"
// page needs the actual appointment time and service name to be useful.
// slot.platform is just the one flag this page needs to decide whether to
// even show a cancel button - not the full Platform shape.
export interface BookingWithSlot extends Booking {
  slot: Slot & { platform: { customerCancellationEnabled: boolean } };
}

export interface ChatConversation {
  id: string;
  platformId: string;
  customerEmail: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: "USER" | "ASSISTANT" | "TOOL";
  content: string;
  toolName: string | null;
  toolResult: unknown;
  createdAt: string;
}
