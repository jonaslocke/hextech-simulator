"use client";

import type { PlayerDecisionCard } from "./player-decision-types";
import { DecisionCardFace } from "./decision-card-face";

export function PublicRevealedCards({
  cards,
}: {
  cards: PlayerDecisionCard[];
}) {
  if (cards.length === 0) {
    return null;
  }

  return (
    <section aria-label="Publicly revealed cards" className="space-y-2">
      <p className="font-semibold text-cyan-100 text-xs uppercase tracking-[0.16em]">
        Revealed cards
      </p>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {cards.map((card) => (
          <article
            className="w-28 shrink-0"
            key={card.id}
          >
            <DecisionCardFace imageUrl={card.imageUrl} label={card.label} className="h-40" />
          </article>
        ))}
      </div>
    </section>
  );
}
