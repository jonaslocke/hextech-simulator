"use client";

import { ReactNode } from "react";

export function ActionButton({
  active,
  children,
  label,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className={`flex size-10 items-center justify-center rounded-md transition ${
        active
          ? "bg-cyan-500 text-white"
          : "bg-[#263142] text-slate-100 hover:bg-[#33445a]"
      }`}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}
