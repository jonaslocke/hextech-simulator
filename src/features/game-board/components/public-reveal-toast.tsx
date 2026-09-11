"use client";

import type { GameProjection } from "@/shared/game";
import { useState } from "react";
import { Button } from "@/shared/components/button";
import { PublicRevealedCards } from "../decisions/public-revealed-cards";

export function PublicRevealToast({
  reveals = [],
}: {
  reveals?: NonNullable<GameProjection["publicReveals"]>;
}) {
  const revealKey = reveals.map((reveal) => reveal.id).join(":");
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  if (dismissedKey === revealKey || reveals.length === 0) return null;

  return (
    <section
      aria-live="polite"
      aria-label="Public card reveal"
      className="top-16 left-1/2 z-[2147483643] fixed shadow-2xl shadow-black/70 backdrop-blur-md px-4 py-3 border border-cyan-300/40 rounded-xl w-[min(42rem,calc(100vw-2rem))] text-slate-100 -translate-x-1/2 bg-slate-950/88"
      role="status"
    >
      <Button aria-label="Close public card reveal" className="float-right ml-3" variant="ghost" onClick={() => setDismissedKey(revealKey)}>
        Close
      </Button>
      {reveals.map((reveal, index) => (
        <div className={index === 0 ? undefined : "mt-3"} key={reveal.id}>
          <p className="text-cyan-100 text-sm">{reveal.message}</p>
          <PublicRevealedCards
            cards={reveal.cards.map((card) => ({
              id: card.instanceId,
              imageUrl: card.imageUrl ?? undefined,
              label: card.name,
            }))}
          />
        </div>
      ))}
    </section>
  );
}
