"use client";

import { ReactNode } from "react";

export function ActionButton({
  active,
  children,
  disabled = false,
  label,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className={`flex size-10 items-center justify-center rounded-md transition disabled:cursor-not-allowed disabled:opacity-45 ${
        active
          ? "bg-cyan-500 text-white"
          : "bg-[#263142] text-slate-100 enabled:hover:bg-[#33445a]"
      }`}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}
