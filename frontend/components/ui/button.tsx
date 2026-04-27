import Link, { type LinkProps } from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

type ButtonVariant = "default" | "secondary" | "ghost" | "nav" | "segment";
type ButtonSize = "default" | "sm" | "lg";

type ButtonOptions = {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const variantClasses: Record<ButtonVariant, string> = {
  default: "primary-button ui-button--default",
  secondary: "ghost-button ui-button--secondary",
  ghost: "ghost-button ui-button--ghost",
  nav: "ui-button--nav",
  segment: "ui-button--segment"
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "ui-button--size-default",
  sm: "ui-button--size-sm",
  lg: "ui-button--size-lg"
};

export function buttonClassName({
  className,
  size = "default",
  variant = "default"
}: ButtonOptions & { className?: string }) {
  return cn("ui-button", variantClasses[variant], sizeClasses[size], className);
}

export function Button({
  className,
  size = "default",
  variant = "default",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & ButtonOptions) {
  return <button className={buttonClassName({ className, size, variant })} {...props} />;
}

type ButtonLinkProps = LinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> &
  ButtonOptions;

export function ButtonLink({
  className,
  size = "default",
  variant = "default",
  ...props
}: ButtonLinkProps) {
  return <Link className={buttonClassName({ className, size, variant })} {...props} />;
}
