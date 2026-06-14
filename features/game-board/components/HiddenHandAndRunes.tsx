"use client";

import { CardBack } from "./CardBack";

export function HiddenHandAndRunes({ handCount }: { handCount: number }) {
  return (
    <div className="relative h-full overflow-hidden">
      <div className="top-2 absolute inset-x-0 flex justify-center">
        <div className="font-semibold text-slate-300 text-xs">
          Hand: {handCount} hidden
        </div>
      </div>
      <div className="bottom-3 left-1/2 absolute flex gap-2 -translate-x-1/2">
        {Array.from({ length: handCount }).map((_, index) => (
          <CardBack key={index} className="w-16 rotate-180" />
        ))}
      </div>
    </div>
  );
}
