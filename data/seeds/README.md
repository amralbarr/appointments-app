# Seed tenant data

Each `.json` file here is one seeded tenant for `backend/prisma/seed.ts` to
load — add a new file to add a new demo tenant, or edit one in place to
change what an existing seeded tenant looks like. No code changes needed
for either; `seed.ts` just reads every `*.json` file in this folder.

## Shape

```json
{
  "ownerEmail": "owner@example.com",
  "ownerName": "Display Name",
  "platformName": "English business name",
  "platformNameAr": "الاسم بالعربية",
  "slug": "url-slug",
  "isActive": true,
  "profile": {
    "description": "English description",
    "descriptionAr": "الوصف بالعربية",
    "address": "Street, City",
    "phone": "+966 ...",
    "businessHoursText": "English display string",
    "businessHoursTextAr": "نص ساعات العمل بالعربية",
    "workingDays": ["SUN", "MON", "TUE", "WED", "THU"],
    "openTime": "09:00",
    "closeTime": "17:00"
  },
  "services": [
    { "name": "English service name", "nameAr": "اسم الخدمة", "durationMinutes": 30 }
  ]
}
```

- `isActive` is optional, defaults to `true` — set `false` for a seeded
  tenant that should show up suspended (useful for exercising the admin
  dashboard's suspend/reactivate UI against something real).
- `workingDays` uses the same `WeekDay` enum values as the backend schema
  (`SUN`..`SAT`). An empty array + `null` open/close times means "no known
  fixed schedule" (a suspended tenant, or a by-appointment-only one) —
  don't invent a plausible-looking schedule nobody actually stated.
- `address`/`phone` are factual/contact fields, not translated content —
  no Arabic counterpart for those two.

Arabic is this platform's default locale, so every file should have real
Arabic content, not just the English half left to backfill later.
