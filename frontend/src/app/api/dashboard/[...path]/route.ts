import { proxyToBackend } from "@/lib/bff-proxy";

// Tenant-scoped catch-all (role OWNER) — forwards straight onto the real
// backend path with no prefix added (the backend has no "/dashboard"
// namespace of its own; `/api/dashboard/platforms/abc` maps onto the real
// `/platforms/abc`). See docs/FRONTEND-ARCHITECTURE.md "BFF pattern".
async function handle(request: Request, ctx: RouteContext<"/api/dashboard/[...path]">) {
  const { path } = await ctx.params;
  return proxyToBackend(request, path, "");
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
export const PUT = handle;
