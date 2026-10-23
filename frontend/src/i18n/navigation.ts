import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// Locale-aware replacements for next/link and next/navigation's
// Link/redirect/usePathname/useRouter — every one of these automatically
// prepends/strips the active locale prefix, so every page/component in
// this app imports navigation primitives from here instead of "next/link"
// or "next/navigation" directly.
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
