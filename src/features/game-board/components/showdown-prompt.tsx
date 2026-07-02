"use client";

import { Swords } from "lucide-react";

export function ShowdownPrompt({
  battlefieldName,
  focusPlayerId,
  hasFocus,
  isCombat,
  onPassFocus
}: {
  battlefieldName: string;
  focusPlayerId: string;
  hasFocus: boolean;
  isCombat: boolean;
  onPassFocus?: () => void;
}) {
  return (
    <section
      aria-live="assertive"
      className="top-12 left-1/2 z-[2147483644] fixed bg-slate-950/95 shadow-2xl shadow-black/70 backdrop-blur-md px-4 py-3 border border-amber-300/40 rounded-xl w-[min(32rem,calc(100vw-2rem))] text-slate-100 -translate-x-1/2"
      role="status"
    >
      <div className="flex items-center gap-3">
        <span className="flex justify-center items-center bg-amber-300/15 border border-amber-200/25 rounded-full size-9 text-amber-200">
          <Swords aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-amber-200 text-xs uppercase tracking-[0.18em]">
            {isCombat ? "Combat showdown" : "Showdown"}
          </p>
          <h2 className="font-semibold truncate">{battlefieldName}</h2>
          <p className="text-slate-300 text-sm">
            {hasFocus
              ? "You have Focus. Play an Action or Reaction, or pass Focus."
              : `Waiting for ${focusPlayerId} to act.`}
          </p>
        </div>
        {hasFocus && onPassFocus && (
          <button
            className="ml-auto bg-amber-300 hover:bg-amber-200 px-3 py-2 rounded font-semibold text-slate-950 text-sm whitespace-nowrap"
            onClick={onPassFocus}
            type="button"
          >
            Pass Focus
          </button>
        )}
      </div>
    </section>
  );
}
