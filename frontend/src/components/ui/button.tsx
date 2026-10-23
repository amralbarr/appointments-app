import { type ButtonHTMLAttributes, forwardRef } from "react";
import { Loader2 } from "lucide-react";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "subtle";
export type ButtonSize = "xs" | "sm" | "md" | "lg";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover hover:shadow focus-visible:ring-primary/40",
  secondary:
    "border border-border-strong bg-surface text-foreground shadow-xs hover:border-primary/50 hover:bg-surface-muted hover:text-foreground focus-visible:ring-primary/40",
  outline:
    "border border-border bg-transparent text-foreground hover:border-border-strong hover:bg-surface-muted focus-visible:ring-primary/40",
  ghost:
    "text-muted-foreground hover:bg-surface-muted hover:text-foreground focus-visible:ring-foreground/20",
  danger:
    "bg-danger text-danger-foreground shadow-sm hover:bg-danger-hover focus-visible:ring-danger/40",
  subtle:
    "bg-primary-subtle text-primary hover:bg-primary/15 focus-visible:ring-primary/40",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  xs: "px-2.5 py-1 text-xs rounded-md",
  sm: "px-3 py-1.5 text-xs sm:text-sm rounded-lg",
  md: "px-4 py-2.5 text-sm rounded-xl",
  lg: "px-5 py-3 text-base rounded-xl font-medium",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "primary", size = "md", loading = false, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 font-semibold transition-all duration-150 ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin shrink-0" />}
      {children}
    </button>
  ),
);
Button.displayName = "Button";
