"use client";

import { useState } from "react";

// Generates a deterministic subtle gradient or color based on the business name
const COLORS = [
  { bg: "bg-indigo-500/10 text-indigo-600 border-indigo-200", ring: "ring-indigo-500/20" },
  { bg: "bg-emerald-500/10 text-emerald-700 border-emerald-200", ring: "ring-emerald-500/20" },
  { bg: "bg-blue-500/10 text-blue-600 border-blue-200", ring: "ring-blue-500/20" },
  { bg: "bg-purple-500/10 text-purple-600 border-purple-200", ring: "ring-purple-500/20" },
  { bg: "bg-rose-500/10 text-rose-600 border-rose-200", ring: "ring-rose-500/20" },
  { bg: "bg-amber-500/10 text-amber-700 border-amber-200", ring: "ring-amber-500/20" },
];

function getPalette(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % COLORS.length;
  return COLORS[index];
}

export function Avatar({
  name,
  logoUrl,
  size = 40,
  className = "",
}: {
  name: string;
  logoUrl?: string | null;
  size?: number;
  className?: string;
}) {
  const [imgError, setImgError] = useState(false);
  const palette = getPalette(name || "A");
  const initial = (name?.trim()?.charAt(0) || "A").toUpperCase();

  if (logoUrl && !imgError) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={name}
        onError={() => setImgError(true)}
        className={`rounded-2xl object-cover shrink-0 shadow-xs ring-1 ring-border ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  const fontSize = Math.max(12, Math.floor(size * 0.42));

  return (
    <div
      className={`rounded-2xl border flex items-center justify-center font-bold shrink-0 shadow-xs ring-2 ${palette.bg} ${palette.ring} ${className}`}
      style={{ width: size, height: size, fontSize: `${fontSize}px` }}
      aria-label={name}
    >
      {initial}
    </div>
  );
}
