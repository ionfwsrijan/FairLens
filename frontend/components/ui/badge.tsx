import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

type BadgeVariant = "default" | "success" | "danger" | "warning";

const variantClasses: Record<BadgeVariant, string> = {
  default: "ui-badge--default",
  success: "ui-badge--success",
  danger: "ui-badge--danger",
  warning: "ui-badge--warning"
};

export function Badge({
  className,
  variant = "default",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return <span className={cn("ui-badge", variantClasses[variant], className)} {...props} />;
}
