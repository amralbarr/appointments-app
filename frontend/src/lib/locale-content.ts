// Shared bilingual-content fallback used anywhere a tenant's own record
// (Platform.name/description/businessHoursText, Service.name) has a
// paired "<field>" / "<field>Ar" column. The viewer's own active locale
// is tried first; if that locale's column is null/empty, the other
// language's column is used instead — a seeded/real record that only has
// one language filled in must never render as a blank field.
//
// Never duplicate this null-check inline per call site — every page/
// component that renders one of these paired fields (the tenant profile
// page, the public listing cards, the booking form's service picker, the
// owner dashboard's slot/service lists) should call this helper instead.
export function localizedField(
  locale: string,
  defaultValue: string | null | undefined,
  arabicValue: string | null | undefined,
): string | null {
  const base = defaultValue && defaultValue.trim() ? defaultValue : null;
  const ar = arabicValue && arabicValue.trim() ? arabicValue : null;
  return locale === "ar" ? (ar ?? base) : (base ?? ar);
}
