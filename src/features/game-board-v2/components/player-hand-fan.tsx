"use client";

import {
  KeyboardEvent,
  MouseEvent,
  useRef,
  useState,
} from "react";
import { motion } from "motion/react";
import { Card } from "../types";
import { CardTile } from "./card-tile";

type PlayerHandFanProps = {
  cards: Card[];
  hiddenCardInstanceIds?: Set<string>;
  onCardContextAction?: (card: Card, event: MouseEvent<HTMLDivElement>) => void;
  onPlayCard?: (card: Card) => void;
  onTuck?: () => void;
  playerId: string;
};

export function PlayerHandFan({
  cards,
  hiddenCardInstanceIds,
  onCardContextAction,
  onPlayCard,
  onTuck,
  playerId,
}: PlayerHandFanProps) {
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
      onTuck?.();
    }, 3000);
  };
  const expandHand = () => {
    clearTuckTimeout();
    setExpanded(true);
  };
  const selectCardAtIndex = (index: number) => {
    onPlayCard?.(cards[index]!);
  };
  const openCardMenu = (
    card: Card,
    event: MouseEvent<HTMLDivElement>,
    index: number,
  ) => {
    event.preventDefault();
    clearTuckTimeout();
    setHoveredIndex(index);
    expandHand();
    onCardContextAction?.(card, event);
  };

  return (
    <div className="right-0 bottom-0 left-0 z-40 absolute flex justify-center h-40 pointer-events-none">
      <div
        aria-label="Player hand"
        className="relative w-full max-w-5xl h-full touch-none pointer-events-auto"
        data-zone-animation-id={`${playerId}:hand`}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            scheduleTuck();
          }
        }}
        onFocus={clearTuckTimeout}
        onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
          if (event.key !== "Enter" && event.key !== " ") {
            return;
          }

          event.preventDefault();
          selectCardAtIndex(hoveredIndex ?? 0);
        }}
        onPointerLeave={scheduleTuck}
        role="button"
        tabIndex={0}
      >
        <div className="absolute inset-0">
          {cards.map((card, index) => {
            const hovered = hoveredIndex === index;
            const motionStyle = handCardMotion({
              expanded,
              hovered,
              index,
              total: cards.length,
            });

            return (
              <div
                className="bottom-0 left-1/2 absolute -translate-x-1/2"
                key={card.instanceId ?? `${card.name}-${index}`}
                style={{ zIndex: motionStyle.zIndex }}
              >
                <motion.div
                  animate={{
                    rotate: motionStyle.rotate,
                    scale: motionStyle.scale,
                    x: motionStyle.x,
                    y: motionStyle.y,
                  }}
                  initial={false}
                  onClick={(event) => {
                    openCardMenu(card, event, index);
                  }}
                  onContextMenu={(event) => {
                    openCardMenu(card, event, index);
                  }}
                  onPointerEnter={() => {
                    clearTuckTimeout();
                    setHoveredIndex(index);
                    expandHand();
                  }}
                  style={{ transformOrigin: "bottom center" }}
                  transition={{
                    duration: 0.2,
                    ease: "easeOut",
                    type: "tween",
                  }}
                >
                  <CardTile
                    enableHoverPreview
                    focusablePreview={false}
                    isTransferHidden={
                      card.instanceId
                        ? hiddenCardInstanceIds?.has(card.instanceId)
                        : false
                    }
                    showMight={false}
                    {...card}
                  />
                </motion.div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function handCardMotion({
  expanded,
  hovered,
  index,
  total,
}: {
  expanded: boolean;
  hovered: boolean;
  index: number;
  total: number;
}) {
  const middle = (total - 1) / 2;
  const offset = index - middle;
  const layout = handLayout({ expanded, total });
  const hoverY = hovered ? layout.hoverLift : 0;
  const rotation = expanded && hovered ? 0 : offset * layout.rotationStep;
  const scale = expanded
    ? hovered
      ? layout.hoverScale
      : layout.scale
    : hovered
      ? layout.collapsedHoverScale
      : layout.collapsedScale;
  const x = offset * layout.spacing;
  const y = layout.baseY + Math.abs(offset) * layout.curve + hoverY;
  const distanceFromCenter = Math.abs(offset);

  return {
    rotate: rotation,
    scale,
    x,
    y,
    zIndex: hovered ? 100 : Math.round(80 - distanceFromCenter * 10),
  };
}

function handLayout({
  expanded,
  total,
}: {
  expanded: boolean;
  total: number;
}) {
  const isLargeHand = total > 10;

  return {
    baseY: expanded ? (isLargeHand ? -78 : -72) : 42,
    collapsedHoverScale: 1.25,
    collapsedScale: 1.15,
    curve: expanded ? (isLargeHand ? 3 : 7) : isLargeHand ? 2 : 4,
    hoverLift: expanded ? (isLargeHand ? -36 : -28) : -20,
    hoverScale: 1.4,
    rotationStep: expanded
      ? isLargeHand
        ? 1.35
        : total > 7
          ? 2
          : 3.5
      : isLargeHand
        ? 1.75
        : total > 7
          ? 3
          : 5,
    scale: 1.25,
    spacing: expanded
      ? isLargeHand
        ? 50
        : total > 7
          ? 38
          : 68
      : isLargeHand
        ? 38
        : total > 7
          ? 30
          : 48,
  };
}

