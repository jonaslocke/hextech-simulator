"use client";

import {
  KeyboardEvent,
  MouseEvent,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
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
  /**
   * Kept in the public contract so existing consumers do not break.
   * This implementation intentionally does not tuck, collapse, auto-hide,
   * or call this callback.
   */
  onTuck?: () => void;
  playerId: string;
};

const MAX_HAND_WIDTH = 1080;
const DEFAULT_HAND_WIDTH = 1024;
const ESTIMATED_CARD_WIDTH = 96;
const MENU_INTERACTION_FREEZE_MS = 650;

export function PlayerHandFan({
  cards,
  hiddenCardInstanceIds,
  onCardContextAction,
  onPlayCard,
  playerId,
}: PlayerHandFanProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [handWidth, setHandWidth] = useState(DEFAULT_HAND_WIDTH);

  const handRef = useRef<HTMLDivElement | null>(null);
  const selectionFreezeUntilRef = useRef(0);

  const freezePointerSelection = useCallback(() => {
    selectionFreezeUntilRef.current = Date.now() + MENU_INTERACTION_FREEZE_MS;
  }, []);

  const releasePointerSelectionFreeze = useCallback(() => {
    selectionFreezeUntilRef.current = 0;
  }, []);

  const isPointerSelectionFrozen = useCallback(
    () => Date.now() < selectionFreezeUntilRef.current,
    [],
  );

  useEffect(() => {
    setActiveIndex((currentIndex) => {
      if (currentIndex === null || cards.length === 0) {
        return null;
      }

      return clamp(currentIndex, 0, cards.length - 1);
    });
  }, [cards.length]);

  useEffect(() => {
    const node = handRef.current;

    if (!node || typeof ResizeObserver === "undefined") {
      return;
    }

    const updateWidth = (nextWidth: number) => {
      if (nextWidth > 0) {
        setHandWidth(nextWidth);
      }
    };

    updateWidth(node.getBoundingClientRect().width);

    const observer = new ResizeObserver(([entry]) => {
      updateWidth(entry?.contentRect.width ?? 0);
    });

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, []);

  const layout = useMemo(
    () =>
      createHandLayout({
        containerWidth: handWidth,
        total: cards.length,
      }),
    [cards.length, handWidth],
  );

  const cardTransition = {
    type: "spring" as const,
    stiffness: 520,
    damping: 42,
    mass: 0.5,
  };

  const getIndexFromPointerPosition = useCallback(
    (
      clientX: number,
      target: HTMLDivElement,
      currentIndex: number | null,
      options?: { sticky?: boolean },
    ) => {
      const rect = target.getBoundingClientRect();

      return getCardIndexFromClientX({
        clientX,
        currentIndex: options?.sticky === false ? null : currentIndex,
        handLeft: rect.left,
        handWidth: rect.width || handWidth,
        layout,
        total: cards.length,
      });
    },
    [cards.length, handWidth, layout],
  );

  const updateActiveIndexFromPointer = useCallback(
    (
      event: ReactPointerEvent<HTMLDivElement>,
      options?: { force?: boolean },
    ) => {
      if (cards.length === 0) {
        return;
      }

      if (!options?.force && isPointerSelectionFrozen()) {
        return;
      }

      const clientX = event.clientX;
      const target = event.currentTarget;

      setActiveIndex((currentIndex) => {
        const nextIndex = getIndexFromPointerPosition(
          clientX,
          target,
          currentIndex,
        );

        return currentIndex === nextIndex ? currentIndex : nextIndex;
      });
    },
    [cards.length, getIndexFromPointerPosition, isPointerSelectionFrozen],
  );

  const clearActiveIndex = useCallback(() => {
    releasePointerSelectionFreeze();
    setActiveIndex(null);
  }, [releasePointerSelectionFreeze]);

  const clearActiveIndexFromPointer = useCallback(() => {
    if (isPointerSelectionFrozen()) {
      return;
    }

    setActiveIndex(null);
  }, [isPointerSelectionFrozen]);

  const selectCardAtIndex = useCallback(
    (index: number | null) => {
      if (index === null) {
        return;
      }

      const card = cards[index];

      if (!card) {
        return;
      }

      onPlayCard?.(card);
    },
    [cards, onPlayCard],
  );

  const openCardMenuFromEvent = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (cards.length === 0) {
        return;
      }

      const pointerIndex = getIndexFromPointerPosition(
        event.clientX,
        event.currentTarget,
        activeIndex,
        { sticky: false },
      );
      const nextIndex = activeIndex ?? pointerIndex;

      if (nextIndex === null) {
        return;
      }

      const card = cards[nextIndex];

      if (!card) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      freezePointerSelection();
      setActiveIndex(nextIndex);
      onCardContextAction?.(card, event);
    },
    [
      activeIndex,
      cards,
      freezePointerSelection,
      getIndexFromPointerPosition,
      onCardContextAction,
    ],
  );

  const moveKeyboardSelection = useCallback(
    (delta: number) => {
      if (cards.length === 0) {
        return;
      }

      releasePointerSelectionFreeze();
      setActiveIndex((currentIndex) =>
        clamp((currentIndex ?? 0) + delta, 0, cards.length - 1),
      );
    },
    [cards.length, releasePointerSelectionFreeze],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      switch (event.key) {
        case "ArrowLeft": {
          event.preventDefault();
          moveKeyboardSelection(-1);
          return;
        }

        case "ArrowRight": {
          event.preventDefault();
          moveKeyboardSelection(1);
          return;
        }

        case "Home": {
          event.preventDefault();
          releasePointerSelectionFreeze();
          setActiveIndex(0);
          return;
        }

        case "End": {
          event.preventDefault();
          releasePointerSelectionFreeze();
          setActiveIndex(cards.length - 1);
          return;
        }

        case "Enter":
        case " ": {
          event.preventDefault();
          selectCardAtIndex(activeIndex ?? 0);
          return;
        }

        case "Escape": {
          event.preventDefault();
          clearActiveIndex();
          return;
        }

        default:
          return;
      }
    },
    [
      activeIndex,
      cards.length,
      clearActiveIndex,
      moveKeyboardSelection,
      releasePointerSelectionFreeze,
      selectCardAtIndex,
    ],
  );

  if (cards.length === 0) {
    return null;
  }

  const activeCardId =
    activeIndex === null
      ? undefined
      : getCardDomId(playerId, cards[activeIndex], activeIndex);

  return (
    <div className="right-0 bottom-0 left-0 z-40 absolute flex justify-center h-64 overflow-visible pointer-events-none">
      <div
        ref={handRef}
        aria-activedescendant={activeCardId}
        aria-label="Player hand"
        className="relative w-full max-w-270 h-full overflow-visible touch-none pointer-events-auto"
        data-active-index={activeIndex ?? undefined}
        data-zone-animation-id={`${playerId}:hand`}
        onBlur={(event) => {
          const nextFocusedTarget = event.relatedTarget;

          if (
            !(nextFocusedTarget instanceof Node) ||
            !event.currentTarget.contains(nextFocusedTarget)
          ) {
            clearActiveIndexFromPointer();
          }
        }}
        onClick={openCardMenuFromEvent}
        onContextMenu={openCardMenuFromEvent}
        onFocus={() => {
          setActiveIndex((currentIndex) => currentIndex ?? 0);
        }}
        onKeyDown={handleKeyDown}
        onPointerCancel={clearActiveIndexFromPointer}
        onPointerDown={(event) => {
          releasePointerSelectionFreeze();
          updateActiveIndexFromPointer(event, { force: true });
        }}
        onPointerEnter={updateActiveIndexFromPointer}
        onPointerLeave={clearActiveIndexFromPointer}
        onPointerMove={updateActiveIndexFromPointer}
        role="listbox"
        tabIndex={0}
      >
        <div className="absolute inset-0 overflow-visible pointer-events-none">
          {cards.map((card, index) => {
            const selected = activeIndex === index;
            const motionStyle = getHandCardMotion({
              activeIndex,
              index,
              layout,
              total: cards.length,
            });

            return (
              <div
                id={getCardDomId(playerId, card, index)}
                aria-label={card.name}
                aria-selected={selected}
                className="bottom-0 left-1/2 absolute"
                key={card.instanceId ?? `${card.name}-${index}`}
                role="option"
                style={{ zIndex: motionStyle.zIndex }}
              >
                <motion.div
                  animate={{
                    rotate: motionStyle.rotate,
                    scale: motionStyle.scale,
                    x: motionStyle.x,
                    y: motionStyle.y,
                  }}
                  data-selected={selected ? "true" : "false"}
                  initial={false}
                  style={{
                    transformOrigin: "50% 100%",
                    willChange: "transform",
                  }}
                  transition={cardTransition}
                >
                  <CardTile
                    enableHoverPreview={false}
                    focusablePreview={false}
                    isTransferHidden={
                      card.instanceId
                        ? hiddenCardInstanceIds?.has(card.instanceId)
                        : false
                    }
                    showMight={false}
                    {...card}
                    size="lg"
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

type HandLayout = {
  activeLift: number;
  activeScale: number;
  centerLift: number;
  edgeDrop: number;
  hitPadding: number;
  neighborPush: number;
  restScale: number;
  rotationStep: number;
  spacing: number;
  switchRadius: number;
};

function getHandCardMotion({
  activeIndex,
  index,
  layout,
  total,
}: {
  activeIndex: number | null;
  index: number;
  layout: HandLayout;
  total: number;
}) {
  const middle = (total - 1) / 2;
  const offset = index - middle;
  const selected = activeIndex === index;
  const hasSelection = activeIndex !== null;

  const normalizedEdgeDistance =
    middle <= 0 ? 0 : Math.min(1, Math.abs(offset) / middle);

  const restingY =
    Math.pow(normalizedEdgeDistance, 1.55) * layout.edgeDrop -
    layout.centerLift;

  const neighborPush = hasSelection
    ? getNeighborPush({
        activeIndex,
        index,
        push: layout.neighborPush,
      })
    : 0;

  return {
    rotate: selected ? 0 : offset * layout.rotationStep,
    scale: selected ? layout.activeScale : layout.restScale,
    x: offset * layout.spacing + neighborPush,
    y: selected ? -layout.activeLift : restingY,
    zIndex: getCardZIndex({
      activeIndex,
      index,
      selected,
      total,
    }),
  };
}

function getNeighborPush({
  activeIndex,
  index,
  push,
}: {
  activeIndex: number | null;
  index: number;
  push: number;
}) {
  if (activeIndex === null || index === activeIndex) {
    return 0;
  }

  const direction = Math.sign(index - activeIndex);
  const distance = Math.abs(index - activeIndex);

  if (distance === 1) {
    return direction * push;
  }

  if (distance === 2) {
    return direction * push * 0.14;
  }

  return 0;
}

function createHandLayout({
  containerWidth,
  total,
}: {
  containerWidth: number;
  total: number;
}): HandLayout {
  const safeWidth = clamp(containerWidth, 360, MAX_HAND_WIDTH);
  const gapCount = Math.max(total - 1, 1);
  const usableWidth = Math.max(safeWidth - ESTIMATED_CARD_WIDTH * 1.75, 0);

  const crowded = total > 12;
  const large = total > 8;

  const minSpacing = crowded ? 30 : large ? 34 : 38;
  const maxSpacing = crowded ? 42 : large ? 46 : 50;

  const spacing =
    total <= 1 ? 0 : clamp(usableWidth / gapCount, minSpacing, maxSpacing);

  const middle = Math.max((total - 1) / 2, 1);
  const maxEdgeRotation = total <= 2 ? 4 : clamp(21 - total * 0.45, 12, 18);

  return {
    activeLift: large ? 10 : 20,
    activeScale: large ? 1.08 : 1.1,
    centerLift: large ? 10 : 12,
    edgeDrop: clamp(26 - total * 0.55, 15, 22),
    hitPadding: Math.max(spacing * 0.72, ESTIMATED_CARD_WIDTH * 0.42),
    neighborPush: clamp(spacing * 0.28, 10, 16),
    restScale: 1,
    rotationStep: total <= 1 ? 0 : maxEdgeRotation / middle,
    spacing,
    switchRadius: clamp(spacing * 0.7, 26, 36),
  };
}

function getCardIndexFromClientX({
  clientX,
  currentIndex,
  handLeft,
  handWidth,
  layout,
  total,
}: {
  clientX: number;
  currentIndex: number | null;
  handLeft: number;
  handWidth: number;
  layout: HandLayout;
  total: number;
}) {
  if (total <= 0) {
    return null;
  }

  const handCenterX = handLeft + handWidth / 2;

  if (total === 1) {
    return Math.abs(clientX - handCenterX) <= layout.hitPadding ? 0 : null;
  }

  const middle = (total - 1) / 2;
  const firstCardCenterX = handCenterX - middle * layout.spacing;
  const lastCardCenterX = handCenterX + middle * layout.spacing;

  if (
    clientX < firstCardCenterX - layout.hitPadding ||
    clientX > lastCardCenterX + layout.hitPadding
  ) {
    return null;
  }

  if (currentIndex !== null) {
    const safeCurrentIndex = clamp(currentIndex, 0, total - 1);
    const currentCardCenterX =
      firstCardCenterX + safeCurrentIndex * layout.spacing;

    if (Math.abs(clientX - currentCardCenterX) <= layout.switchRadius) {
      return safeCurrentIndex;
    }
  }

  return clamp(
    Math.round((clientX - firstCardCenterX) / layout.spacing),
    0,
    total - 1,
  );
}

function getCardZIndex({
  activeIndex,
  index,
  selected,
  total,
}: {
  activeIndex: number | null;
  index: number;
  selected: boolean;
  total: number;
}) {
  if (selected) {
    return 1000;
  }

  if (activeIndex !== null) {
    return 500 - Math.abs(index - activeIndex);
  }

  const middle = (total - 1) / 2;

  return 100 + Math.round((total - Math.abs(index - middle)) * 10);
}

function getCardDomId(playerId: string, card: Card | undefined, index: number) {
  const fallbackId = `${card?.name ?? "card"}-${index}`;
  const cardId = card?.instanceId ?? fallbackId;

  return `${toDomIdPart(playerId)}-hand-card-${toDomIdPart(cardId)}`;
}

function toDomIdPart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
