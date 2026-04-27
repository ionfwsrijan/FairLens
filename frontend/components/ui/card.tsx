import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

type CardVariant = "default" | "glass" | "metric" | "panel";

const variantClasses: Record<CardVariant, string> = {
  default: "ui-card--default",
  glass: "glass-panel ui-card--glass",
  metric: "ui-card--metric",
  panel: "panel ui-card--panel"
};

export function Card({
  className,
  variant = "default",
  ...props
}: HTMLAttributes<HTMLDivElement> & { variant?: CardVariant }) {
  return <div className={cn("ui-card", variantClasses[variant], className)} {...props} />;
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("ui-card-header", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("ui-card-title", className)} {...props} />;
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("ui-card-description", className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("ui-card-content", className)} {...props} />;
}
