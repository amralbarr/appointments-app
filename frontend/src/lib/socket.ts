"use client";

import { io, type Socket } from "socket.io-client";

// Connects to the backend's /realtime namespace (backend/src/realtime) and
// joins one platform's room — read-only, no credential needed, see
// backend/docs/REALTIME.md.
//
// Deliberately the CURRENT PAGE's own origin (window.location.origin),
// not a separate NEXT_PUBLIC_-env-var-configured backend URL - found
// live on the real deployed site that a hardcoded/env-configured origin
// is actively broken: this app now serves from two different public
// domains (appointments.buildron.net and appointments.amralbarr.com,
// see ngnix/) pointing at the SAME build output, and a NEXT_PUBLIC_ var
// is baked in at build time - one absolute origin literally cannot be
// correct for both domains at once. Same-origin also means the existing
// nginx config's own `location /socket.io/ { proxy_pass
// http://127.0.0.1:6410; }` rule (every file under ngnix/) already
// routes this correctly under whichever domain the visitor is actually
// on, with zero extra config - a real visitor's
// browser was previously trying to reach "localhost:3000" on their OWN
// machine, which obviously isn't this app's backend, because no env var
// was ever actually set in production for the old approach to work.
export function connectToPlatformRoom(platformId: string): Socket {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const socket = io(`${origin}/realtime`, { transports: ["websocket", "polling"] });
  socket.on("connect", () => {
    socket.emit("join", { platformId });
  });
  return socket;
}
