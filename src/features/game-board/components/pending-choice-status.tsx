"use client";

import { Hourglass } from "lucide-react";

export function PendingChoiceStatus({
  count,
  playerName,
}: {
  count: number;
  playerName: string;
}) {
  return (
    <section
      aria-live="assertive"
      className="top-12 left-1/2 z-[2147483644] fixed bg-slate-950/95 shadow-2xl shadow-black/70 backdrop-blur-md px-4 py-3 border border-cyan-300/40 rounded-xl w-[min(32rem,calc(100vw-2rem))] text-slate-100 -translate-x-1/2"
      role="status"
    >
      <div className="flex items-center gap-3">
        <span className="flex justify-center items-center bg-cyan-300/15 border border-cyan-200/25 rounded-full size-9 text-cyan-200">
          <Hourglass aria-hidden="true" className="size-4" />
        </span>
        <div>
          <p className="font-semibold text-cyan-200 text-xs uppercase tracking-[0.18em]">
            End-of-turn choice
          </p>
          <p className="text-slate-200 text-sm">
            Waiting for {playerName} to choose {count} runes to ready.
          </p>
        </div>
      </div>
    </section>
  );
}
