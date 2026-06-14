"use client";

import type { Card } from "@/server/catalog";
import { CardImage } from "./CardImage";
import { CSSProperties } from "react";

function handStyle(index: number, total: number): CSSProperties {
  const middle = (total - 1) / 2;
  const offset = index - middle;
  const rotate = Math.max(-10, Math.min(10, offset * 5));

  return {
    "--hand-rotate": `${rotate}deg`,
  } as CSSProperties;
}

export function RuneAndHandZone({
  hand,
  runes,
}: {
  hand: Card[];
  runes: Card[];
}) {
  return (
    <div className="relative h-full min-h-40 overflow-visible">
      <div className="bottom-2 left-4 absolute flex gap-2">
        {runes.map((rune, index) => (
          <CardImage
            key={`${rune.name}-${index}`}
            card={rune}
            className="w-20"
          />
        ))}
      </div>

      <div className="bottom-8 left-[58%] absolute flex items-end gap-1 -translate-x-1/2">
        {hand.map((card, index) => (
          <CardImage
            key={`${card.name}-${index}`}
            card={card}
            className="hover:z-20 w-24 rotate-(--hand-rotate) hover:scale-125 origin-bottom transition-transform hover:-translate-y-12 duration-150"
            style={handStyle(index, hand.length)}
          />
        ))}
      </div>
    </div>
  );
}
