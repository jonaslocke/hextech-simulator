"use client";

import { CardRulesText } from "@/features/card-presentation";
import cardBackImage from "../../../../assets/cardback.jpg";
import { cn } from "@/shared/utils/cn";
import { cva, type VariantProps } from "class-variance-authority";
import { Info } from "lucide-react";
import { motion } from "motion/react";
import {
  useCallback,
  useEffect,
  useRef,
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
import { CardTile } from "./card-tile";
import { AttachmentCardGroup } from "./attachment-card-group";
import { groupCardsByAttachment } from "./attachment-layout";

const BATTLEFIELD_ART_BACKGROUND_SIZE = "178% auto";
const BATTLEFIELD_ART_BACKGROUND_POSITION = "center 43%";

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

const battlefieldMightBadge = cva([
  "top-1/2 right-2 z-20 absolute flex flex-col items-center",
  "bg-amber-300/88 supports-backdrop-filter:bg-amber-300/78",
  "shadow-[0_0_18px_rgba(251,191,36,0.20)] supports-backdrop-filter:backdrop-blur-sm",
  "p-0.5 border border-amber-100/45 rounded-full overflow-hidden",
  "font-semibold text-[10px] text-slate-950 -translate-y-1/2",
]);

const battlefieldDescriptionBar = cva([
  "bottom-0 absolute inset-x-0 flex items-center",
  "bg-slate-950/26 supports-backdrop-filter:bg-slate-950/16 hover:bg-slate-950/48",
  "shadow-[0_-10px_22px_rgba(0,0,0,0.16)] supports-backdrop-filter:backdrop-blur-sm",
  "gap-3 px-3 border-white/8 border-t h-full",
  "text-[10px] text-slate-100/88 text-left",
  "transition-colors duration-300 ease-out",
]);

const battlefieldUnitRow = cva(
  [
    "flex flex-wrap gap-1 pl-2 min-h-0 overflow-auto",
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
  playerId?: string;
  opponentPlayerId?: string;
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
    id,
    name,
    opponentAttachments,
    opponentUnits,
    playerAttachments,
    playerUnits,
    facedownCard,
    facedownCardPresent,
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
  playerId,
  opponentPlayerId,
  showdownState = "neutral",
  enablePlayerUnitLocationDrag = false,
  stagedMovementCardInstanceIds,
}) => {
  const [isBattlefieldCardOpen, setIsBattlefieldCardOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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
      rootRef.current = node;
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
    <motion.div
      aria-selected={isHighlighted}
      data-battlefield-visual-state={visualState}
      data-drop-status={dropStatus}
      data-highlighted={isEmphasized ? "true" : undefined}
      data-owner={owner}
      data-showdown-state={showdownState}
      initial={false}
      layout="position"
      ref={setBattlefieldRootRef}
      className={cn(battlefieldRoot({ visualState }), "flex-1")}
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
        {isBattlefieldCardOpen && (
          <div className="bottom-9 left-2 z-[120] absolute bg-slate-950/72 supports-backdrop-filter:bg-slate-950/56 shadow-2xl shadow-black/70 supports-backdrop-filter:backdrop-blur-md p-1 border border-white/12 rounded-lg ring-1 ring-cyan-300/10">
            {/* eslint-disable-next-line @next/next/no-img-element -- Battlefield art comes from the catalog. */}
            <img
              alt={name}
              className="block rounded-md w-80 max-w-[min(20rem,calc(50vw-2rem))] object-contain aspect-1038/744"
              src={img}
            />
          </div>
        )}

        {hasMightToShow && (
          <div className={cn(battlefieldMightBadge(), facedownCardPresent && "right-20")}>
            <div className="px-1 py-0.5 leading-none">{opponentTotalMight}</div>
            <div className="px-1 font-extrabold text-[8px] text-slate-950/70 leading-none">
              VS
            </div>
            <div className="px-1 py-0.5 leading-none">{playerTotalMight}</div>
          </div>
        )}

        <BattlefieldUnitRow
          attachments={opponentAttachments}
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
          attachments={playerAttachments}
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
        <BattlefieldFacedownZone
          card={facedownCard}
          isPresent={facedownCardPresent}
          highlightedCardInstanceIds={highlightedCardInstanceIds}
          hiddenCardInstanceIds={hiddenCardInstanceIds}
          onCardPointerEnter={onCardPointerEnter}
          onCardPointerLeave={onCardPointerLeave}
          onCardPrimaryAction={onCardPrimaryAction}
        />
      </div>

      <div className="relative h-[34px] overflow-visible">
        <div className={battlefieldDescriptionBar()}>
          <div className="flex flex-col justify-center shrink-0 w-[40%] min-w-0 leading-tight">
            <div className="flex items-center gap-1 min-w-0">
              <span className="font-semibold truncate">{name}</span>
              <button
                type="button"
                aria-expanded={isBattlefieldCardOpen}
                aria-label={`Show ${name} battlefield card`}
                className="flex justify-center items-center hover:bg-white/10 border-white/12 border-l focus-visible:outline focus-visible:outline-yellow-300 size-5 shrink-0 text-white/70 hover:text-white transition"
                onClick={() => setIsBattlefieldCardOpen((isOpen) => !isOpen)}
              >
                <Info aria-hidden="true" className="size-3" />
              </button>
            </div>
            <span className="truncate text-[9px] text-white/70">
              {contestedByPlayerId
                ? `Contested by ${contestedByPlayerId === playerId ? "You" : contestedByPlayerId === opponentPlayerId ? "Opponent" : "a player"}`
                : controllerPlayerId
                  ? `Controlled by ${controllerPlayerId === playerId ? "You" : controllerPlayerId === opponentPlayerId ? "Opponent" : "a player"}`
                  : "Uncontrolled"}
            </span>
          </div>
          <div className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] line-clamp-2 leading-snug">
            <CardRulesText text={description} />
          </div>
        </div>
      </div>
    </motion.div>
  );
};

function BattlefieldUnitRow({
  attachments = [],
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
  attachments?: Card[];
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
  const attachmentGroups = groupCardsByAttachment([...cards, ...attachments]);
  return (
    <motion.div
      className={cn(battlefieldUnitRow({ side }), className)}
      data-zone-animation-id={zoneAnimationId}
      data-board-scroll
      layout
      transition={BATTLEFIELD_ROW_LAYOUT_TRANSITION}
    >
      {attachmentGroups.map(({ host: unit, attachments: attachedCards }, index) => {
        const key = unit.instanceId ?? `${unit.name}-${index}`;
        const tile = (
          <CardTile
            size="lg"
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

        const isUnit = unit.type?.split(" / ").includes("Unit") && cards.some((card) => card.instanceId === unit.instanceId);
        const hostTile =
          !isUnit || !dragSourceLocation || !unit.instanceId ? (
            tile
          ) : (
            <DraggableLocationCard
              cardInstanceId={unit.instanceId}
              sourceLocation={dragSourceLocation}
            >
              {tile}
            </DraggableLocationCard>
          );
        if (attachedCards.length === 0) {
          return <div key={key}>{hostTile}</div>;
        }
        return (
          <AttachmentCardGroup
            groupId={key}
            key={key}
            size="lg"
            host={hostTile}
            attachments={attachedCards.map((attachment, attachmentIndex) => ({
              id: attachment.instanceId ?? `${attachment.name}-${attachmentIndex}`,
              card: <CardTile
                  size="lg"
                  enableHoverPreview
                  isHighlighted={
                    attachment.instanceId
                      ? highlightedCardInstanceIds?.has(attachment.instanceId)
                      : false
                  }
                  isTransferHidden={
                    attachment.instanceId
                      ? hiddenCardInstanceIds?.has(attachment.instanceId)
                      : false
                  }
                  onPrimaryAction={
                    onCardPrimaryAction
                      ? (event) => onCardPrimaryAction(attachment, event)
                      : undefined
                  }
                  onHighlightPointerEnter={
                    onCardPointerEnter
                      ? () => onCardPointerEnter(attachment)
                      : undefined
                  }
                  onHighlightPointerLeave={
                    onCardPointerLeave
                      ? () => onCardPointerLeave(attachment)
                      : undefined
                  }
                  showMight
                  {...attachment}
                />,
            }))}
          />
        );
      })}
    </motion.div>
  );
}

export function BattlefieldFacedownZone({
  card,
  hiddenCardInstanceIds,
  highlightedCardInstanceIds,
  isPresent,
  onCardPointerEnter,
  onCardPointerLeave,
  onCardPrimaryAction,
}: {
  card: Card | null;
  hiddenCardInstanceIds?: Set<string>;
  highlightedCardInstanceIds?: Set<string>;
  isPresent: boolean;
  onCardPointerEnter?: (card: Card) => void;
  onCardPointerLeave?: (card: Card) => void;
  onCardPrimaryAction?: (card: Card, event?: MouseEvent<HTMLDivElement>) => void;
}) {
  if (!isPresent) return null;

  return (
    <div
      aria-label="Facedown Zone"
      role="group"
      className="bottom-0 left-1/2 z-30 absolute -translate-x-1/2 overflow-visible"
      data-testid="facedown-zone"
    >
      <div className={cn("group relative h-9 w-[86px] overflow-visible", card && "hover:-translate-y-[88px] focus-within:-translate-y-[88px] transition-transform duration-200 motion-reduce:transition-none")}>
        <div className="h-9 w-[86px] overflow-hidden rounded-md border border-fuchsia-200/40 bg-slate-950/90 shadow-xl ring-1 ring-fuchsia-300/20">
          <CardTile
            {...(card ?? {})}
            size="md"
            name={card?.name ?? "Hidden card"}
            img={card?.img ?? cardBackImage.src}
            type={card?.type ?? "Hidden"}
            isHighlighted={card?.instanceId ? highlightedCardInstanceIds?.has(card.instanceId) : false}
            isTransferHidden={card?.instanceId ? hiddenCardInstanceIds?.has(card.instanceId) : false}
            onPrimaryAction={card && onCardPrimaryAction ? (event) => onCardPrimaryAction(card, event) : undefined}
            onHighlightPointerEnter={card && onCardPointerEnter ? () => onCardPointerEnter(card) : undefined}
            onHighlightPointerLeave={card && onCardPointerLeave ? () => onCardPointerLeave(card) : undefined}
          />
        </div>
        <span className="top-1 left-1 z-40 absolute rounded bg-slate-950/80 px-1 font-bold text-[9px] text-fuchsia-100 tracking-wide">HIDDEN</span>
      </div>
    </div>
  );
}
