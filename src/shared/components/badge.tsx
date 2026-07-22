import * as React from "react";

import { cn } from "@/shared/utils/cn";

function Badge({ className, variant = "default", ...props }: React.ComponentProps<"span"> & {
  variant?: "default" | "secondary" | "outline";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        variant === "default" && "border-transparent bg-primary text-primary-foreground",
        variant === "secondary" && "border-transparent bg-secondary text-secondary-foreground",
        variant === "outline" && "border-border bg-transparent text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { Badge };
