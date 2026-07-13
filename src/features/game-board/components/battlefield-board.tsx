"use client";

import { CardRulesText } from "@/features/card-presentation";
import { cn } from "@/shared/utils/cn";
import cardBackImage from "../../../../assets/cardback.jpg";
import { cva, type VariantProps } from "class-variance-authority";
import { Info } from "lucide-react";
import { motion } from "motion/react";
import {
  useCallback,
  useEffect,
  useState,
  type FC,
  type MouseEvent,
} from "react";
import { DraggableLocationCard } from "../drag-and-drop/draggable-location-card";
import type {
  BoardDragSourceLocation,
  BoardLocationDropStatus,
} from "../drag-and-drop/location-drag-actions";
import { useBoardLocationDroppable } from "../drag-and-drop/use-board-location-droppable";
import type { BattlefieldData, Card } from "../types";
import { BattlefieldCardDialog } from "./battlefield-card-dialog";
import { CardTile } from "./card-tile";

const BATTLEFIELD_ART_BACKGROUND_SIZE = "178% auto";
const BATTLEFIELD_ART_BACKGROUND_POSITION = "center 43%";

const BATTLEFIELD_WIDTH_BY_SHOWDOWN_STATE = {
  neutral: "50%",
  open: "60%",
  deferred: "40%",
} as const;

const BATTLEFIELD_SIZE_TRANSITION = {
  type: "spring",
  stiffness: 260,
  damping: 30,
  mass: 0.75,
} as const;

const BATTLEFIELD_ROW_LAYOUT_TRANSITION = {
  type: "spring",
  stiffness: 300,
  damping: 34,
  mass: 0.65,
} as const;

const battlefieldRoot = cva(
  [
    "isolate relative grid grid-rows-[minmax(0,1fr)_34px] rounded-lg min-w-0 overflow-hidden",
    "border bg-slate-950/10 transition-[border-color,background-color,box-shadow,--tw-ring-color] duration-300 ease-out",
    "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.025),0_14px_32px_rgba(0,0,0,0.18)]",
    "supports-backdrop-filter:bg-slate-950/6 supports-backdrop-filter:backdrop-blur-[1px]",
  ],
  {
    variants: {
      visualState: {
        idle: "border-cyan-100/14",
        highlighted:
          "border-cyan-200/70 bg-cyan-300/6 shadow-[inset_0_0_0_1px_rgba(103,232,249,0.24),0_0_28px_rgba(34,211,238,0.18),0_14px_32px_rgba(0,0,0,0.18)]",
        legalDrop:
          "border-cyan-200/70 bg-cyan-300/6 ring-1 ring-inset ring-cyan-300/55 shadow-[inset_0_0_0_1px_rgba(103,232,249,0.24),0_0_28px_rgba(34,211,238,0.18),0_0_18px_rgba(103,232,249,0.12),0_14px_32px_rgba(0,0,0,0.18)]",
        legalDropOver:
          "border-emerald-200/80 bg-emerald-300/[0.08] ring-2 ring-inset ring-emerald-300/90 shadow-[inset_0_0_0_1px_rgba(110,231,183,0.28),0_0_24px_rgba(110,231,183,0.28),0_14px_32px_rgba(0,0,0,0.18)]",
        invalidDropOver:
          "border-rose-300/70 bg-rose-500/[0.06] ring-2 ring-inset ring-rose-300/70 shadow-[0_0_18px_rgba(251,113,133,0.16),0_14px_32px_rgba(0,0,0,0.18)]",
      },
    },
    defaultVariants: {
      visualState: "idle",
    },
  },
);

const battlefieldRadialOverlay = cva(
  [
    "z-10 absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 ease-out pointer-events-none",
  ],
  {
    variants: {
      visualState: {
        idle: "opacity-0 bg-[radial-gradient(circle_at_center,rgba(103,232,249,0.16),transparent_58%)]",
        highlighted:
          "opacity-100 bg-[radial-gradient(circle_at_center,rgba(103,232,249,0.16),transparent_58%)]",
        legalDrop:
          "opacity-100 bg-[radial-gradient(circle_at_center,rgba(103,232,249,0.16),transparent_58%)]",
        legalDropOver:
          "opacity-100 bg-[radial-gradient(circle_at_center,rgba(110,231,183,0.18),transparent_58%)]",
        invalidDropOver:
          "opacity-100 bg-[radial-gradient(circle_at_center,rgba(251,113,133,0.12),transparent_58%)]",
      },
    },
    defaultVariants: {
      visualState: "idle",
    },
  },
);

const battlefieldInsetOverlay = cva(
  [
    "z-10 absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 ease-out pointer-events-none",
  ],
  {
    variants: {
      visualState: {
        idle: "opacity-0",
        highlighted:
          "opacity-100 shadow-[inset_0_0_0_1px_rgba(165,243,252,0.26),inset_0_0_28px_rgba(34,211,238,0.12)]",
        legalDrop:
          "opacity-100 shadow-[inset_0_0_0_1px_rgba(165,243,252,0.26),inset_0_0_28px_rgba(34,211,238,0.12)]",
        legalDropOver:
          "opacity-100 shadow-[inset_0_0_0_1px_rgba(167,243,208,0.34),inset_0_0_30px_rgba(110,231,183,0.16)]",
        invalidDropOver:
          "opacity-100 shadow-[inset_0_0_0_1px_rgba(254,205,211,0.24),inset_0_0_26px_rgba(251,113,133,0.10)]",
      },
    },
    defaultVariants: {
      visualState: "idle",
    },
  },
);

const battlefieldNamePill = cva(
  [
    "inline-flex top-1.5 left-2 z-[99] absolute items-center",
    "bg-slate-950/38 supports-backdrop-filter:bg-slate-950/28",
    "shadow-black/30 shadow-lg supports-backdrop-filter:backdrop-blur-md",
    "border border-white/12 rounded-full max-w-[calc(100%-1rem)] overflow-hidden",
    "text-[10px] text-slate-100 uppercase",
  ],
  {
    variants: {
      emphasized: {
        true: "border-cyan-100/24 shadow-cyan-950/20",
        false: "",
      },
    },
    defaultVariants: {
      emphasized: false,
    },
  },
);

const battlefieldStatusBadge = cva(
  [
    "top-1.5 right-2 z-[98] absolute",
    "bg-slate-950/70 px-2 py-0.5 border rounded-full",
    "font-mono text-[9px]",
  ],
  {
    variants: {
      state: {
        controlled: "border-amber-200/25 text-amber-100",
        contested: "border-rose-200/30 text-rose-100",
      },
    },
    defaultVariants: {
      state: "controlled",
    },
  },
);

const battlefieldMightBadge = cva([
  "top-1/2 right-2 z-20 absolute flex flex-col items-center",
  "bg-amber-300/88 supports-backdrop-filter:bg-amber-300/78",
  "shadow-[0_0_18px_rgba(251,191,36,0.20)] supports-backdrop-filter:backdrop-blur-sm",
  "p-0.5 border border-amber-100/45 rounded-full overflow-hidden",
  "font-semibold text-[10px] text-slate-950 -translate-y-1/2",
]);

const battlefieldDescriptionBar = cva([
  "bottom-0 absolute inset-x-0 flex justify-center items-center",
  "bg-slate-950/26 supports-backdrop-filter:bg-slate-950/16 hover:bg-slate-950/48",
  "shadow-[0_-10px_22px_rgba(0,0,0,0.16)] supports-backdrop-filter:backdrop-blur-sm",
  "px-3 border-white/8 border-t h-full hover:min-h-14",
  "text-[10px] text-slate-100/88 hover:text-white hover:text-sm text-center",
  "transition-[background-color,min-height,font-size,color] duration-300 ease-out",
]);

const battlefieldUnitRow = cva(
  [
    "flex flex-wrap gap-2 min-h-0 overflow-auto",
    "[scrollbar-color:rgba(103,232,249,0.25)_transparent]",
  ],
  {
    variants: {
      side: {
        opponent: "items-end pb-2 border-cyan-100/14 border-b border-dashed",
        player: "pt-2",
      },
    },
    defaultVariants: {
      side: "player",
    },
  },
);

type BattlefieldVisualState = NonNullable<
  VariantProps<typeof battlefieldRoot>["visualState"]
>;

type Props = {
  battlefield: BattlefieldData;
  highlightedCardInstanceIds?: Set<string>;
  hiddenCardInstanceIds?: Set<string>;
  isHighlighted?: boolean;
  onCardPrimaryAction?: (
    card: Card,
    event?: MouseEvent<HTMLDivElement>,
  ) => void;
  onCardPointerEnter?: (card: Card) => void;
  onCardPointerLeave?: (card: Card) => void;
  owner: "player" | "opponent";
  showdownState?: "neutral" | "open" | "deferred";
  enablePlayerUnitLocationDrag?: boolean;
  dropStatus?: BoardLocationDropStatus;
  isLocationDropEnabled?: boolean;
  stagedMovementCardInstanceIds?: Set<string>;
};

function resolveBattlefieldVisualState({
  dropStatus,
  isHighlighted,
}: {
  dropStatus: BoardLocationDropStatus;
  isHighlighted: boolean;
}): BattlefieldVisualState {
  if (dropStatus === "invalid-over") {
    return "invalidDropOver";
  }

  if (dropStatus === "legal-over") {
    return "legalDropOver";
  }

  if (dropStatus === "legal") {
    return "legalDrop";
  }

  if (isHighlighted) {
    return "highlighted";
  }

  return "idle";
}

function isBattlefieldEmphasized(visualState: BattlefieldVisualState) {
  return visualState !== "idle";
}

export const BattlefieldBoard: FC<Props> = ({
  battlefield: {
    contestedByPlayerId,
    controllerPlayerId,
    description,
    hasFacedownCard,
    id,
    name,
    opponentUnits,
    playerUnits,
    img,
  },
  dropStatus = "idle",
  isLocationDropEnabled = false,
  highlightedCardInstanceIds,
  hiddenCardInstanceIds,
  isHighlighted = false,
  onCardPointerEnter,
  onCardPointerLeave,
  onCardPrimaryAction,
  owner,
  showdownState = "neutral",
  enablePlayerUnitLocationDrag = false,
  stagedMovementCardInstanceIds,
}) => {
  const [isBattlefieldCardOpen, setIsBattlefieldCardOpen] = useState(false);

  const visualState = resolveBattlefieldVisualState({
    dropStatus,
    isHighlighted,
  });
  const isEmphasized = isBattlefieldEmphasized(visualState);

  const { setNodeRef } = useBoardLocationDroppable({
    disabled: !isLocationDropEnabled,
    location: {
      kind: "battlefield",
      battlefieldId: id,
    },
  });

  const setBattlefieldRootRef = useCallback(
    (node: HTMLDivElement | null) => {
      setNodeRef(node);
    },
    [setNodeRef],
  );

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

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsBattlefieldCardOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isBattlefieldCardOpen]);

  return (
    <motion.div
      aria-selected={isHighlighted}
      animate={{
        width: BATTLEFIELD_WIDTH_BY_SHOWDOWN_STATE[showdownState],
      }}
      data-battlefield-visual-state={visualState}
      data-drop-status={dropStatus}
      data-highlighted={isEmphasized ? "true" : undefined}
      data-owner={owner}
      data-showdown-state={showdownState}
      initial={false}
      layout="position"
      ref={setBattlefieldRootRef}
      transition={BATTLEFIELD_SIZE_TRANSITION}
      className={battlefieldRoot({ visualState })}
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
      <div
        aria-hidden="true"
        className={battlefieldRadialOverlay({ visualState })}
      />
      <div
        aria-hidden="true"
        className={battlefieldInsetOverlay({ visualState })}
      />

      <div className="relative grid grid-rows-2 p-2 min-h-0">
        <div className={battlefieldNamePill({ emphasized: isEmphasized })}>
          <span className="px-2 py-0.5 font-mono font-semibold truncate tracking-wide">
            {name}
          </span>
          <button
            type="button"
            aria-expanded={isBattlefieldCardOpen}
            aria-label={`Show ${name} battlefield card`}
            className="flex justify-center items-center hover:bg-white/10 border-white/12 border-l focus-visible:outline focus-visible:outline-yellow-300 size-5 text-white/70 hover:text-white transition"
            onClick={() => setIsBattlefieldCardOpen((isOpen) => !isOpen)}
          >
            <Info aria-hidden="true" className="size-3" />
          </button>
        </div>

        {(controllerPlayerId || contestedByPlayerId) && (
          <div
            className={battlefieldStatusBadge({
              state: contestedByPlayerId ? "contested" : "controlled",
            })}
          >
            {contestedByPlayerId
              ? `Contested by ${contestedByPlayerId}`
              : `Controlled by ${controllerPlayerId}`}
          </div>
        )}

        {isBattlefieldCardOpen && (
          <BattlefieldCardDialog
            contestedByPlayerId={contestedByPlayerId}
            controllerPlayerId={controllerPlayerId}
            description={description}
            img={img}
            name={name}
            onClose={() => setIsBattlefieldCardOpen(false)}
          />
        )}

        {hasMightToShow && (
          <div className={battlefieldMightBadge()}>
            <div className="px-1 py-0.5 leading-none">{opponentTotalMight}</div>
            <div className="px-1 font-extrabold text-[8px] text-slate-950/70 leading-none">
              VS
            </div>
            <div className="px-1 py-0.5 leading-none">{playerTotalMight}</div>
          </div>
        )}

        {hasFacedownCard && (
          <div className="right-3 bottom-9 z-20 absolute flex items-center gap-1.5 bg-slate-950/75 shadow-lg px-1.5 py-1 border border-cyan-100/25 rounded-md backdrop-blur-sm pointer-events-none">
            {/* eslint-disable-next-line @next/next/no-img-element -- Local card-back asset for a hidden card. */}
            <img
              alt="Facedown card"
              className="shadow-sm border border-white/20 rounded-sm w-7 h-10 object-cover"
              src={cardBackImage.src}
            />
            <span className="font-mono font-semibold text-[9px] text-cyan-50 uppercase tracking-wide">
              Facedown
            </span>
          </div>
        )}

        <BattlefieldUnitRow
          cards={opponentUnits}
          hiddenCardInstanceIds={hiddenCardInstanceIds}
          highlightedCardInstanceIds={highlightedCardInstanceIds}
          onCardPointerEnter={onCardPointerEnter}
          onCardPointerLeave={onCardPointerLeave}
          onCardPrimaryAction={onCardPrimaryAction}
          side="opponent"
          zoneAnimationId={`battlefield:${id}:opponent`}
        />

        <BattlefieldUnitRow
          cards={playerUnits}
          dragSourceLocation={
            enablePlayerUnitLocationDrag
              ? { kind: "battlefield", battlefieldId: id }
              : undefined
          }
          hiddenCardInstanceIds={hiddenCardInstanceIds}
          highlightedCardInstanceIds={highlightedCardInstanceIds}
          onCardPointerEnter={onCardPointerEnter}
          onCardPointerLeave={onCardPointerLeave}
          onCardPrimaryAction={onCardPrimaryAction}
          side="player"
          stagedMovementCardInstanceIds={stagedMovementCardInstanceIds}
          zoneAnimationId={`battlefield:${id}:player`}
        />
      </div>

      <div className="relative h-8.5 overflow-visible">
        <div className={battlefieldDescriptionBar()}>
          <div className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] line-clamp-2 leading-snug">
            <CardRulesText text={description} />
          </div>
        </div>
      </div>
    </motion.div>
  );
};

function BattlefieldUnitRow({
  cards,
  className,
  dragSourceLocation,
  hiddenCardInstanceIds,
  highlightedCardInstanceIds,
  onCardPointerEnter,
  onCardPointerLeave,
  onCardPrimaryAction,
  side = "player",
  zoneAnimationId,
  stagedMovementCardInstanceIds,
}: {
  cards: Card[];
  className?: string;
  dragSourceLocation?: BoardDragSourceLocation;
  hiddenCardInstanceIds?: Set<string>;
  highlightedCardInstanceIds?: Set<string>;
  onCardPrimaryAction?: (
    card: Card,
    event?: MouseEvent<HTMLDivElement>,
  ) => void;
  onCardPointerEnter?: (card: Card) => void;
  onCardPointerLeave?: (card: Card) => void;
  side?: "opponent" | "player";
  zoneAnimationId: string;
  stagedMovementCardInstanceIds?: Set<string>;
}) {
  return (
    <motion.div
      className={cn(battlefieldUnitRow({ side }), className)}
      data-zone-animation-id={zoneAnimationId}
      layout
      transition={BATTLEFIELD_ROW_LAYOUT_TRANSITION}
    >
      {cards.map((unit, index) => {
        const key = unit.instanceId ?? `${unit.name}-${index}`;
        const tile = (
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
            isStagedForMovement={
              unit.instanceId
                ? stagedMovementCardInstanceIds?.has(unit.instanceId)
                : false
            }
            {...unit}
          />
        );

        if (!dragSourceLocation || !unit.instanceId) {
          return <div key={key}>{tile}</div>;
        }

        return (
          <DraggableLocationCard
            cardInstanceId={unit.instanceId}
            key={key}
            sourceLocation={dragSourceLocation}
          >
            {tile}
          </DraggableLocationCard>
        );
      })}
    </motion.div>
  );
}
