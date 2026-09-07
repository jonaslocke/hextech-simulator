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
      <div className="flex gap-2 overflow-x-auto pb-1">
        {cards.map((card) => (
          <article
            className="flex items-center gap-2 bg-white/5 px-2 py-1.5 border border-cyan-300/25 rounded-md min-w-44"
            key={card.id}
          >
            {card.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- Card art is sourced from the server-projected catalog.
              <img
                alt=""
                className="rounded-sm w-10 h-14 object-contain"
                src={card.imageUrl}
              />
            )}
            <div className="min-w-0">
              <p className="font-medium text-slate-100 text-sm leading-tight">
                {card.label}
              </p>
              {card.description && (
                <p className="mt-0.5 text-slate-400 text-xs line-clamp-2">
                  {card.description}
                </p>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
