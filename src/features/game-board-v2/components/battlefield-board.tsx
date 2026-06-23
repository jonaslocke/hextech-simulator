import { cn } from "@/shared/utils/cn";
import { Info } from "lucide-react";
import { FC, MouseEvent, useEffect, useRef, useState } from "react";
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
  showdownState?: "neutral" | "open" | "deferred"; //tied to the game state open or neutral - 'deferred' due to be smaller when other BF is on showdown state open -- betternaming is needed
};

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
        "relative grid grid-rows-[minmax(0,1fr)_36px] bg-white/5 rounded-md overflow-hidden",
        showdownState === "neutral" && "w-1/2",
        showdownState === "open" && "w-3/5",
        showdownState === "deferred" && "w-2/5",
      )}
    >
      <div
        className="absolute bg-center brightness-[0.35] saturate-[0.85] w-full h-full scale-180"
        style={{
          backgroundImage: `url(${img})`,
        }}
      />
      <div className="relative grid grid-rows-2 p-2">
        <div className="top-1 left-2 z-99 absolute flex items-center bg-black/50 text-[10px] uppercase">
          <span className="px-1 py-0.5 font-mono">{name}</span>
          <button
            type="button"
            aria-expanded={isBattlefieldCardOpen}
            aria-label={`Show ${name} battlefield card`}
            className="flex justify-center items-center border-white/15 border-l focus-visible:outline focus-visible:outline-yellow-300 w-5 h-5 text-white/80 hover:text-white"
            onClick={() => setIsBattlefieldCardOpen((isOpen) => !isOpen)}
          >
            <Info aria-hidden="true" className="size-3" />
          </button>
        </div>
        {isBattlefieldCardOpen && (
          <div className="top-8 left-2 z-120 absolute bg-slate-950/95 shadow-2xl p-1 rounded-md ring-1 ring-white/15">
            {/* eslint-disable-next-line @next/next/no-img-element -- Battlefield art comes from the catalog. */}
            <img
              alt={name}
              className="block rounded-md w-72 max-w-[min(18rem,calc(50vw-2rem))] object-contain aspect-1038/744"
              src={img}
            />
          </div>
        )}
        {/* this might work better with a monospaced font */}
        {hasMightToShow && (
          <div className="top-[50%] right-0 absolute flex flex-col items-center bg-yellow-300 p-0.5 text-[10px] text-black/80 translate-y-[-50%]">
            <div className="p-0.5 leading-[100%]">{opponentTotalMight}</div>
            <div className="font-extrabold text-[8px] leading-[100%]">VS</div>
            <div className="p-0.5 leading-[100%]">{playerTotalMight}</div>
          </div>
        )}
        {/* opponent's units */}
        <div
          className="flex flex-wrap items-end gap-2 pb-2 border-white/10 border-b border-dashed overflow-auto"
          data-zone-animation-id={`battlefield:${id}:opponent`}
        >
          {opponentUnits.map((unit, index) => (
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
        {/* player's units */}
        <div
          className="flex flex-wrap gap-2 pt-2 overflow-auto"
          data-zone-animation-id={`battlefield:${id}:player`}
        >
          {playerUnits.map((unit, index) => (
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
      </div>
      <div className="relative h-9">
        <div className="bottom-0 hover:absolute flex justify-center items-center bg-white/15 px-2 hover:py-2 rounded-b-md w-full h-full hover:h-auto text-[10px] hover:text-base text-center transition">
          <p>{description}</p>
        </div>
      </div>
    </div>
  );
};

