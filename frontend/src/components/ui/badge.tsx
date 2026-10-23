import type { HTMLAttributes } from "react";

type BadgeVariant = "default" | "primary" | "success" | "danger" | "warning" | "neutral";
type BadgeSize = "sm" | "md";

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  default: "bg-surface-muted text-foreground border-border",
  primary: "bg-primary-subtle text-primary border-primary/20",
  success: "bg-success-subtle text-success border-success/20",
  danger: "bg-danger-subtle text-danger border-danger/20",
  warning: "bg-warning-subtle text-amber-800 border-warning-border",
  neutral: "bg-surface-muted text-muted-foreground border-border",
};

const SIZE_CLASSES: Record<BadgeSize, string> = {
  sm: "px-2 py-0.5 text-xs font-medium",
  md: "px-2.5 py-1 text-xs font-semibold",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
}

export function Badge({
  className = "",
  variant = "default",
  size = "sm",
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border transition-colors ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
