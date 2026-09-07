"use client";

import type { PlayerDecisionCard } from "./player-decision-types";

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
            className="shrink-0"
            key={card.id}
          >
            {card.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- Card art is sourced from the server-projected catalog.
              <img
                alt={card.label}
                className="shadow-lg rounded-md w-28 h-40 object-contain"
                src={card.imageUrl}
              />
            )}
            <p className="mt-1 max-w-28 font-medium text-slate-100 text-xs leading-tight">
              {card.label}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
