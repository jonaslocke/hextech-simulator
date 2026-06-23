"use client";

import { ReactNode } from "react";

export function BoardSlot({
  children,
  className = "",
  title,
}: {
  children: ReactNode;
  className?: string;
  title: string;
}) {
  return (
    <div className={`min-h-0 rounded-md bg-[#2f3a4d] p-2 ${className}`}>
      <div className="mb-1 font-medium text-[10px] text-slate-400/80 uppercase tracking-[0.08em]">
        {title}
      </div>
      <div className="h-[calc(100%-20px)]">{children}</div>
    </div>
  );
}

