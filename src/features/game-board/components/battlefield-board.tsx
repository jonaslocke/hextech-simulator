"use client";

import { Info } from "lucide-react";
import { FC, MouseEvent, useEffect, useRef, useState } from "react";
import { cn } from "@/shared/utils/cn";
import { BattlefieldData } from "../types";
import type { Card } from "../types";
import { CardTile } from "./card-tile";

type Props = {
  battlefield: BattlefieldData;
  highlightedCardInstanceIds?: Set<string>;
  hiddenCardInstanceIds?: Set<string>;
  onCardPrimaryAction?: (
    card: Card,
    event?: MouseEvent<HTMLDivElement>,
  ) => void;
  onCardPointerEnter?: (card: Card) => void;
  onCardPointerLeave?: (card: Card) => void;
  owner: "player" | "opponent";
  showdownState?: "neutral" | "open" | "deferred";
};

const BATTLEFIELD_ART_BACKGROUND_SIZE = "178% auto";
const BATTLEFIELD_ART_BACKGROUND_POSITION = "center 43%";

export const BattlefieldBoard: FC<Props> = ({
  battlefield: { description, id, name, opponentUnits, playerUnits, img },
  highlightedCardInstanceIds,
  hiddenCardInstanceIds,
  onCardPointerEnter,
  onCardPointerLeave,
  onCardPrimaryAction,
  owner,
  showdownState = "neutral",
}) => {
  const [isBattlefieldCardOpen, setIsBattlefieldCardOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const playerTotalMight = playerUnits.reduce(
    (acc, cur) => acc + (cur.might ?? 0),
    0,
  );
  const opponentTotalMight = opponentUnits.reduce(
    (acc, cur) => acc + (cur.might ?? 0),
    0,
  );
  const hasMightToShow = playerTotalMight + opponentTotalMight > 0;

  useEffect(() => {
    if (!isBattlefieldCardOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsBattlefieldCardOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsBattlefieldCardOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isBattlefieldCardOpen]);

  return (
    <div
      data-owner={owner}
      ref={rootRef}
      className={cn(
        "isolate relative grid grid-rows-[minmax(0,1fr)_34px] rounded-lg overflow-hidden",
        "border border-cyan-100/14 bg-slate-950/10",
        "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.025),0_14px_32px_rgba(0,0,0,0.18)]",
        "supports-backdrop-filter:bg-slate-950/6 supports-backdrop-filter:backdrop-blur-[1px]",
        showdownState === "neutral" && "w-1/2",
        showdownState === "open" && "w-3/5",
        showdownState === "deferred" && "w-2/5",
      )}
    >
      <div
        aria-hidden="true"
        className="-z-30 absolute inset-0 bg-no-repeat bg-center brightness-[0.72] saturate-[1.22] contrast-[1.08]"
        style={{
          backgroundImage: `url(${img})`,
          backgroundPosition: BATTLEFIELD_ART_BACKGROUND_POSITION,
          backgroundSize: BATTLEFIELD_ART_BACKGROUND_SIZE,
        }}
      />
      <div
        aria-hidden="true"
        className="-z-20 absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.05),transparent_54%),linear-gradient(180deg,rgba(2,6,23,0.10),rgba(2,6,23,0.32))]"
      />
      <div
        aria-hidden="true"
        className="-z-10 absolute inset-0 bg-slate-950/12 shadow-[inset_0_0_64px_rgba(0,0,0,0.34)]"
      />

      <div className="relative grid grid-rows-2 p-2 min-h-0">
        <div className="inline-flex top-1.5 left-2 z-[99] absolute items-center bg-slate-950/38 supports-backdrop-filter:bg-slate-950/28 shadow-black/30 shadow-lg supports-backdrop-filter:backdrop-blur-md border border-white/12 rounded-full max-w-[calc(100%-1rem)] overflow-hidden text-[10px] text-slate-100 uppercase">
          <span className="px-2 py-0.5 font-mono font-semibold truncate tracking-wide">
            {name}
          </span>
          <button
            type="button"
            aria-expanded={isBattlefieldCardOpen}
            aria-label={`Show ${name} battlefield card`}
            className="flex justify-center items-center hover:bg-white/10 border-white/12 border-l focus-visible:outline focus-visible:outline-2 focus-visible:outline-yellow-300 size-5 text-white/70 hover:text-white transition"
            onClick={() => setIsBattlefieldCardOpen((isOpen) => !isOpen)}
          >
            <Info aria-hidden="true" className="size-3" />
          </button>
        </div>

        {isBattlefieldCardOpen && (
          <div className="top-9 left-2 z-[120] absolute bg-slate-950/72 supports-backdrop-filter:bg-slate-950/56 shadow-2xl shadow-black/70 supports-backdrop-filter:backdrop-blur-md p-1 border border-white/12 rounded-lg ring-1 ring-cyan-300/10">
            {/* eslint-disable-next-line @next/next/no-img-element -- Battlefield art comes from the catalog. */}
            <img
              alt={name}
              className="block rounded-md w-80 max-w-[min(20rem,calc(50vw-2rem))] object-contain aspect-1038/744"
              src={img}
            />
          </div>
        )}

        {hasMightToShow && (
          <div className="top-1/2 right-2 z-20 absolute flex flex-col items-center bg-amber-300/88 supports-backdrop-filter:bg-amber-300/78 shadow-[0_0_18px_rgba(251,191,36,0.20)] supports-backdrop-filter:backdrop-blur-sm p-0.5 border border-amber-100/45 rounded-full overflow-hidden font-semibold text-[10px] text-slate-950 -translate-y-1/2">
            <div className="px-1 py-0.5 leading-none">{opponentTotalMight}</div>
            <div className="px-1 font-extrabold text-[8px] text-slate-950/70 leading-none">
              VS
            </div>
            <div className="px-1 py-0.5 leading-none">{playerTotalMight}</div>
          </div>
        )}

        <BattlefieldUnitRow
          cards={opponentUnits}
          className="items-end pb-2 border-cyan-100/14 border-b border-dashed"
          hiddenCardInstanceIds={hiddenCardInstanceIds}
          highlightedCardInstanceIds={highlightedCardInstanceIds}
          onCardPointerEnter={onCardPointerEnter}
          onCardPointerLeave={onCardPointerLeave}
          onCardPrimaryAction={onCardPrimaryAction}
          zoneAnimationId={`battlefield:${id}:opponent`}
        />

        <BattlefieldUnitRow
          cards={playerUnits}
          className="pt-2"
          hiddenCardInstanceIds={hiddenCardInstanceIds}
          highlightedCardInstanceIds={highlightedCardInstanceIds}
          onCardPointerEnter={onCardPointerEnter}
          onCardPointerLeave={onCardPointerLeave}
          onCardPrimaryAction={onCardPrimaryAction}
          zoneAnimationId={`battlefield:${id}:player`}
        />
      </div>

      <div className="relative h-[34px] overflow-visible">
        <div className="bottom-0 absolute inset-x-0 flex justify-center items-center bg-slate-950/26 supports-backdrop-filter:bg-slate-950/16 hover:bg-slate-950/48 shadow-[0_-10px_22px_rgba(0,0,0,0.16)] supports-backdrop-filter:backdrop-blur-sm px-3 border-white/8 border-t h-full hover:min-h-14 text-[10px] text-slate-100/88 hover:text-white hover:text-sm text-center transition-[background-color,min-height,font-size,color] duration-300 ease-out">
          <p className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] line-clamp-2 leading-snug">
            {description}
          </p>
        </div>
      </div>
    </div>
  );
};

function BattlefieldUnitRow({
  cards,
  className,
  hiddenCardInstanceIds,
  highlightedCardInstanceIds,
  onCardPointerEnter,
  onCardPointerLeave,
  onCardPrimaryAction,
  zoneAnimationId,
}: {
  cards: Card[];
  className?: string;
  hiddenCardInstanceIds?: Set<string>;
  highlightedCardInstanceIds?: Set<string>;
  onCardPrimaryAction?: (
    card: Card,
    event?: MouseEvent<HTMLDivElement>,
  ) => void;
  onCardPointerEnter?: (card: Card) => void;
  onCardPointerLeave?: (card: Card) => void;
  zoneAnimationId: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap gap-2 min-h-0 overflow-auto [scrollbar-color:rgba(103,232,249,0.25)_transparent]",
        className,
      )}
      data-zone-animation-id={zoneAnimationId}
    >
      {cards.map((unit, index) => (
        <CardTile
          enableHoverPreview
          isHighlighted={
            unit.instanceId
              ? highlightedCardInstanceIds?.has(unit.instanceId)
              : false
          }
          isTransferHidden={
            unit.instanceId
              ? hiddenCardInstanceIds?.has(unit.instanceId)
              : false
          }
          key={unit.instanceId ?? `${unit.name}-${index}`}
          onPrimaryAction={
            onCardPrimaryAction
              ? (event) => onCardPrimaryAction(unit, event)
              : undefined
          }
          onHighlightPointerEnter={
            onCardPointerEnter ? () => onCardPointerEnter(unit) : undefined
          }
          onHighlightPointerLeave={
            onCardPointerLeave ? () => onCardPointerLeave(unit) : undefined
          }
          {...unit}
        />
      ))}
    </div>
  );
}
