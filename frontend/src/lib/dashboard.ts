import { backendJson } from "@/lib/backend";
import type { Platform } from "@/lib/types";

// Shared by every (dashboard) page: resolves "the platform this owner is
// managing" the same way the profile page does (first platform GET
// /platforms returns) — see the note on dashboard/page.tsx for why this
// doesn't support a multi-platform switcher yet.
export async function getMyPlatform(accessToken: string): Promise<Platform | null> {
  const platforms = await backendJson<Platform[]>("platforms", { accessToken });
  return platforms[0] ?? null;
}
