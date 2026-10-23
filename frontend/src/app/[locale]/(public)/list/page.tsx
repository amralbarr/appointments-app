import { backendJson } from "@/lib/backend";
import type { PublicPlatform } from "@/lib/types";
import { ListClient } from "./list-client";

// Server Component — calls the shared backend helper directly rather than
// round-tripping through this app's own /api/public/platforms route.
// No caching: a newly-suspended or newly-created tenant should
// show up on the very next load.
export default async function ListPage() {
  const platforms = await backendJson<PublicPlatform[]>("platforms/public");

  return <ListClient platforms={platforms} />;
}
