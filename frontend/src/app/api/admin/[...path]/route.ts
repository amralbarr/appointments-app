import { proxyToBackend } from "@/lib/bff-proxy";

// Admin-scoped catch-all (role ADMIN) — separate route file from
// /api/dashboard/* on purpose (ROLES-AND-DASHBOARDS.md: a stolen tenant
// cookie should have zero code path to an admin route). Every call here
// forwards to the backend's own "admin/" prefix, which is itself guarded
// by AdminGuard on top of the normal auth chain — a tenant's valid-but-
// wrong-role cookie still gets a real 403 from the backend, not a silent
// pass-through from this proxy.
async function handle(request: Request, ctx: RouteContext<"/api/admin/[...path]">) {
  const { path } = await ctx.params;
  return proxyToBackend(request, path, "admin");
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
export const PUT = handle;
