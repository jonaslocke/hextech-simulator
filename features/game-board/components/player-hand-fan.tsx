"use client";

import { CSSProperties, useRef, useState } from "react";
import { Card } from "../types";
import { CardTile } from "./card-tile";

type PlayerHandFanProps = {
  cards: Card[];
  onPlayCard?: (card: Card) => void;
};

export function PlayerHandFan({ cards, onPlayCard }: PlayerHandFanProps) {
  const [expanded, setExpanded] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const tuckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (cards.length === 0) {
    return null;
  }

  const clearTuckTimeout = () => {
    if (tuckTimeoutRef.current) {
      clearTimeout(tuckTimeoutRef.current);
      tuckTimeoutRef.current = null;
    }
  };
  const scheduleTuck = () => {
    clearTuckTimeout();
    tuckTimeoutRef.current = setTimeout(() => {
      setExpanded(false);
      setHoveredIndex(null);
    }, 3000);
  };
  const expandHand = () => {
    clearTuckTimeout();
    setExpanded(true);
  };

  return (
    <div className="right-0 bottom-0 left-0 z-40 absolute flex justify-center h-40 pointer-events-none">
      <div
        className="relative w-full max-w-5xl h-full pointer-events-auto"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            scheduleTuck();
          }
        }}
        onClick={expandHand}
        onFocus={clearTuckTimeout}
        onMouseEnter={clearTuckTimeout}
        onMouseLeave={scheduleTuck}
      >
        {cards.map((card, index) => {
          const hovered = hoveredIndex === index;

          return (
            <button
              aria-label={expanded ? `Play ${card.name}` : "Open hand"}
              className="bottom-0 left-1/2 absolute transition-transform duration-200 ease-out"
              key={card.instanceId ?? `${card.name}-${index}`}
              onClick={(event) => {
                event.stopPropagation();

                if (!expanded) {
                  expandHand();
                  return;
                }

                onPlayCard?.(card);
              }}
              onFocus={() => {
                clearTuckTimeout();
                setHoveredIndex(index);
              }}
              onMouseEnter={() => {
                clearTuckTimeout();
                setHoveredIndex(index);
              }}
              onMouseLeave={() => setHoveredIndex(null)}
              style={handCardStyle({
                expanded,
                hovered,
                index,
                total: cards.length,
              })}
              type="button"
            >
              <CardTile {...card} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function handCardStyle({
  expanded,
  hovered,
  index,
  total,
}: {
  expanded: boolean;
  hovered: boolean;
  index: number;
  total: number;
}): CSSProperties {
  const middle = (total - 1) / 2;
  const offset = index - middle;
  const isLargeHand = total > 10;
  const spacing = expanded
    ? isLargeHand
      ? 50
      : total > 7
        ? 38
        : 68
    : isLargeHand
      ? 38
      : total > 7
        ? 30
        : 48;
  const rotationStep = expanded
    ? isLargeHand
      ? 1.35
      : total > 7
        ? 2
        : 3.5
    : isLargeHand
      ? 1.75
      : total > 7
        ? 3
        : 5;
  const curve = expanded ? (isLargeHand ? 3 : 7) : isLargeHand ? 2 : 4;
  const baseY = expanded ? (isLargeHand ? -78 : -72) : 42;
  const hoverY = hovered ? (isLargeHand ? -36 : -28) : 0;
  const rotation = expanded && hovered ? 0 : offset * rotationStep;
  const scale = expanded ? (hovered ? 1.4 : 1.25) : hovered ? 1.25 : 1.15;
  const x = offset * spacing;
  const y = baseY + Math.abs(offset) * curve + hoverY;
  const distanceFromCenter = Math.abs(offset);

  return {
    transform: `translateX(calc(-50% + ${x}px)) translateY(${y}px) rotate(${rotation}deg) scale(${scale})`,
    transformOrigin: "bottom center",
    zIndex: hovered ? 100 : Math.round(80 - distanceFromCenter * 10),
  };
}
