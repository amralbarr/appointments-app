"use client";

import { Link, usePathname } from "@/i18n/navigation";
import type { ComponentProps, ReactNode } from "react";

export interface NavLinkProps extends ComponentProps<typeof Link> {
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
  exact?: boolean;
}

export function NavLink({
  href,
  children,
  icon,
  className = "",
  exact = false,
  ...props
}: NavLinkProps) {
  const pathname = usePathname();
  const hrefStr = href.toString();
  const isActive = exact ? pathname === hrefStr : pathname === hrefStr || (hrefStr !== "/dashboard" && hrefStr !== "/admin" && pathname.startsWith(hrefStr));

  return (
    <Link
      href={href}
      className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all duration-150 ${
        isActive
          ? "bg-primary text-primary-foreground shadow-xs"
          : "text-muted-foreground hover:bg-surface-muted hover:text-foreground"
      } ${className}`}
      {...props}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span>{children}</span>
    </Link>
  );
}
