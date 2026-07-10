import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/shared/utils/cn";

const buttonVariants = cva(
  [
    "inline-flex shrink-0 cursor-pointer items-center justify-center",
    "gap-2 whitespace-nowrap rounded-md",
    "text-sm font-medium",
    "transition-[background-color,border-color,color,box-shadow,opacity,transform]",
    "outline-none",
    "focus-visible:border-ring",
    "focus-visible:ring-2 focus-visible:ring-ring/50",
    "active:translate-y-px",
    "disabled:cursor-not-allowed disabled:opacity-50",
    "disabled:active:translate-y-0",
    "aria-invalid:border-destructive",
    "aria-invalid:ring-destructive/20",
    "[&_svg]:pointer-events-none",
    "[&_svg]:shrink-0",
    "[&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        default: [
          "bg-primary text-primary-foreground",
          "shadow-sm shadow-black/20",
          "hover:bg-primary/90",
        ],
        destructive: [
          "bg-destructive text-destructive-foreground",
          "shadow-sm shadow-black/20",
          "hover:bg-destructive/90",
          "focus-visible:ring-destructive/35",
        ],
        outline: [
          "border border-border bg-transparent text-foreground",
          "shadow-xs",
          "hover:border-action-border",
          "hover:bg-accent hover:text-accent-foreground",
        ],
        secondary: [
          "border border-action-border/60",
          "bg-secondary text-secondary-foreground",
          "hover:border-action-border",
          "hover:bg-secondary/80",
        ],
        ghost: [
          "bg-transparent text-foreground",
          "hover:bg-accent hover:text-accent-foreground",
        ],
        link: [
          "h-auto bg-transparent p-0 text-primary",
          "underline-offset-4",
          "hover:underline",
          "active:translate-y-0",
        ],
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: [
          "h-6 gap-1 rounded-md px-2 text-xs",
          "has-[>svg]:px-1.5",
          "[&_svg:not([class*='size-'])]:size-3",
        ],
        sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": [
          "size-6 rounded-md",
          "[&_svg:not([class*='size-'])]:size-3",
        ],
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
      fullWidth: {
        true: "w-full",
        false: "",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      fullWidth: false,
    },
  },
);

function Button({
  asChild = false,
  className,
  fullWidth,
  size = "default",
  type,
  variant = "default",
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const classes = cn(
    buttonVariants({
      className,
      fullWidth,
      size,
      variant,
    }),
  );

  if (asChild) {
    return (
      <Slot.Root
        className={classes}
        data-size={size}
        data-slot="button"
        data-variant={variant}
        {...props}
      />
    );
  }

  return (
    <button
      className={classes}
      data-size={size}
      data-slot="button"
      data-variant={variant}
      type={type ?? "button"}
      {...props}
    />
  );
}

export { Button, buttonVariants };
