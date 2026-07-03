"use client";

import { Hourglass } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/shared/utils/cn";

type PendingChoiceStatusTone = "cyan" | "amber";

export function PendingChoiceStatus({
  message,
  title,
  tone = "cyan",
}: {
  message: ReactNode;
  title: string;
  tone?: PendingChoiceStatusTone;
}) {
  return (
    <section
      aria-live="assertive"
      className={cn(
        "top-12 left-1/2 z-[2147483644] fixed shadow-2xl shadow-black/70 backdrop-blur-md px-4 py-3 rounded-xl w-[min(32rem,calc(100vw-2rem))] text-slate-100 -translate-x-1/2",
        "border bg-slate-950/88 supports-backdrop-filter:bg-slate-950/72",
        tone === "cyan" && "border-cyan-300/40 ring-1 ring-cyan-300/10",
        tone === "amber" && "border-amber-300/35 ring-1 ring-amber-300/10",
      )}
      role="status"
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex justify-center items-center border rounded-full size-9",
            tone === "cyan" &&
              "border-cyan-200/25 bg-cyan-300/15 text-cyan-200",
            tone === "amber" &&
              "border-amber-200/25 bg-amber-300/15 text-amber-200",
          )}
        >
          <Hourglass aria-hidden="true" className="size-4" />
        </span>

        <div className="min-w-0">
          <p
            className={cn(
              "font-semibold text-xs uppercase tracking-[0.18em]",
              tone === "cyan" && "text-cyan-200",
              tone === "amber" && "text-amber-200",
            )}
          >
            {title}
          </p>
          <p className="text-slate-200 text-sm">{message}</p>
        </div>
      </div>
    </section>
  );
}
