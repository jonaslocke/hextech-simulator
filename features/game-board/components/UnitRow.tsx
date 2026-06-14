"use client";

import { Card } from "@/server/catalog";
import { EmptyState } from "./EmptyState";
import { CardImage } from "./CardImage";

export function UnitRow({
  cards,
  mirrored = false,
}: {
  cards: Card[];
  mirrored?: boolean;
}) {
  if (cards.length === 0) {
    return <EmptyState label="No units here" />;
  }

  return (
    <div className="flex justify-center items-center gap-2 h-full">
      {cards.map((card, index) => (
        <CardImage
          key={`${card.name}-${index}`}
          card={card}
          className={`w-20 ${mirrored ? "-rotate-90" : "rotate-90"}`}
        />
      ))}
    </div>
  );
}
