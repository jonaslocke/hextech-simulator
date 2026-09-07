"use client";

import type { GameProjection } from "@/shared/game";
import { useEffect, useState } from "react";
import { PublicRevealedCards } from "../decisions/public-revealed-cards";

export function PublicRevealToast({
  reveals = [],
}: {
  reveals?: NonNullable<GameProjection["publicReveals"]>;
}) {
  const revealKey = reveals.map((reveal) => reveal.id).join(":");
  const [visibleKey, setVisibleKey] = useState(revealKey);

  useEffect(() => {
    setVisibleKey(revealKey);
    if (!revealKey) return;
    const timeout = window.setTimeout(() => setVisibleKey(""), 12_000);
    return () => window.clearTimeout(timeout);
  }, [revealKey]);

  if (!visibleKey || reveals.length === 0) return null;

  return (
    <section
      aria-live="polite"
      aria-label="Public card reveal"
      className="top-16 left-1/2 z-[2147483643] fixed shadow-2xl shadow-black/70 backdrop-blur-md px-4 py-3 border border-cyan-300/40 rounded-xl w-[min(42rem,calc(100vw-2rem))] text-slate-100 -translate-x-1/2 bg-slate-950/88"
      role="status"
    >
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
