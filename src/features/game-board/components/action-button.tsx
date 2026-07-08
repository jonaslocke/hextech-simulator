"use client";

import type { ReactNode } from "react";
import { Button } from "@/shared/components/button";
import { cn } from "@/shared/utils/cn";

type ActionButtonVariant = "default" | "concede";

export function ActionButton({
  active,
  children,
  className,
  disabled = false,
  label,
  onClick,
  variant = "default",
}: {
  active: boolean;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  variant?: ActionButtonVariant;
}) {
  return (
    <Button
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "flex justify-center items-center disabled:opacity-45 p-0 rounded-md size-10 transition disabled:cursor-not-allowed",
        active
          ? "bg-cyan-500 text-white hover:bg-cyan-400"
          : "bg-[#263142] text-slate-100 hover:bg-[#33445a]",
        !active &&
          variant === "concede" &&
          "border border-red-400/30 bg-red-950/70 text-red-100 hover:bg-red-900/80",
        className,
      )}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
      variant="ghost"
    >
      {children}
    </Button>
  );
}
