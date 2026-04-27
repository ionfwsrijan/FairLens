import type { ButtonHTMLAttributes, HTMLAttributes } from "react";
import { cn } from "../../lib/utils";
import { Button } from "./button";

export function TabsList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("ui-tabs-list", className)} {...props} />;
}

type TabsTriggerProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
};

export function TabsTrigger({ active, className, ...props }: TabsTriggerProps) {
  return (
    <Button
      className={cn("ui-tabs-trigger", active && "active", className)}
      variant="segment"
      {...props}
    />
  );
}
