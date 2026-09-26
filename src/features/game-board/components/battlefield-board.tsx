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
import { resolveBattlefieldDensity } from "../board-geometry";
import { useBoardGeometryProfile } from "../use-board-geometry-profile";
import { BoardScrollArea } from "./board-scroll-area";
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
  "flex shrink-0 flex-col items-center",
  "bg-amber-300/88 supports-backdrop-filter:bg-amber-300/78",
  "shadow-[0_0_18px_rgba(251,191,36,0.20)] supports-backdrop-filter:backdrop-blur-sm",
  "p-0.5 border border-amber-100/45 rounded-full overflow-hidden",
  "font-semibold text-[10px] text-slate-950",
]);

const battlefieldDescriptionBar = cva([
  "flex min-w-0 flex-1 items-center justify-center overflow-hidden",
  "border-l border-white/10 px-3 text-[10px] leading-tight text-center text-slate-100/88",
]);

const battlefieldUnitRow = cva(
  [
    "flex w-full min-h-full flex-wrap content-center items-start min-w-0 overflow-visible",
    "[scrollbar-color:rgba(103,232,249,0.25)_transparent]",
  ],
  {
    variants: {
      side: {
        opponent: "border-cyan-100/14 border-b border-dashed",
        player: "",
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
    id,
    name,
    opponentAttachments,
    opponentUnits,
    playerAttachments,
    playerUnits,
    facedownCard,
    facedownCardPresent,
    facedownCardOnPlayerSide,
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

      <div className="relative grid min-h-0 grid-cols-[minmax(0,1fr)_128px] grid-rows-2 p-1">
        {isBattlefieldCardOpen && (
          <div className="top-2 left-2 z-[120] absolute bg-slate-950/90 shadow-2xl shadow-black/70 p-1 border border-white/12 rounded-lg ring-1 ring-cyan-300/10">
            {/* eslint-disable-next-line @next/next/no-img-element -- Battlefield art comes from the catalog. */}
            <img
              alt={name}
              className="block rounded-md w-80 max-w-[min(20rem,calc(50vw-2rem))] object-contain aspect-1038/744"
              src={img}
            />
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
        <BattlefieldStatusLane
          battlefieldId={id}
          card={facedownCard}
          hasMight={opponentTotalMight > 0}
          highlightedCardInstanceIds={highlightedCardInstanceIds}
          hiddenCardInstanceIds={hiddenCardInstanceIds}
          might={opponentTotalMight}
          onCardPointerEnter={onCardPointerEnter}
          onCardPointerLeave={onCardPointerLeave}
          onCardPrimaryAction={onCardPrimaryAction}
          present={facedownCardPresent && !facedownCardOnPlayerSide}
          side="opponent"
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
        <BattlefieldStatusLane
          battlefieldId={id}
          card={facedownCard}
          hasMight={playerTotalMight > 0}
          highlightedCardInstanceIds={highlightedCardInstanceIds}
          hiddenCardInstanceIds={hiddenCardInstanceIds}
          might={playerTotalMight}
          onCardPointerEnter={onCardPointerEnter}
          onCardPointerLeave={onCardPointerLeave}
          onCardPrimaryAction={onCardPrimaryAction}
          present={facedownCardPresent && facedownCardOnPlayerSide}
          side="player"
        />
      </div>

      <div className="relative flex h-[34px] min-w-0 items-center overflow-hidden border-t border-white/10 bg-slate-950/35">
        <div className="flex min-w-0 flex-col justify-center gap-0.5 px-2">
          <div className="flex min-w-0 items-center gap-1">
            <span className="max-w-36 truncate font-mono text-[10px] font-semibold tracking-wide text-white" title={name}>{name}</span>
            <button
              type="button"
              aria-expanded={isBattlefieldCardOpen}
              aria-label={`Show ${name} battlefield card`}
              className="flex size-4 shrink-0 items-center justify-center border-l border-white/15 text-white/75 hover:text-white focus-visible:outline focus-visible:outline-yellow-300"
              onClick={() => setIsBattlefieldCardOpen((isOpen) => !isOpen)}
            ><Info aria-hidden="true" className="size-3" /></button>
          </div>
          <span className={cn("truncate text-[8px] leading-none", contestedByPlayerId ? "text-rose-100" : "text-amber-100")}>
            {contestedByPlayerId ? "Contested" : controllerPlayerId ? "Controlled" : "Uncontrolled"}
          </span>
        </div>
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
  const profile = useBoardGeometryProfile();
  const [usableWidth, setUsableWidth] = useState(0);
  const visualGroups = attachmentGroups.map(({ host, attachments: attachedCards }) => ({
    kind: "unit" as const,
    exhausted: Boolean(host.isExhausted),
    attachmentCount: attachedCards.length,
  }));
  const density = resolveBattlefieldDensity({ usableWidth, groups: visualGroups, profile });

  return (
    <BoardScrollArea
      ariaLabel={`${side} Battlefield units`}
      className={cn("min-w-0 min-h-0", className)}
      onViewportWidthChange={setUsableWidth}
    >
    <motion.div
      className={cn(battlefieldUnitRow({ side }), density.wraps ? "content-start" : "content-center")}
      data-zone-animation-id={zoneAnimationId}
      data-battlefield-density={`${density.size}/${density.gap}${density.wraps ? "/wrap" : ""}`}
      data-battlefield-card-size={density.size}
      layout
      style={{ columnGap: density.gap, rowGap: 6 }}
      transition={BATTLEFIELD_ROW_LAYOUT_TRANSITION}
    >
      {attachmentGroups.map(({ host: unit, attachments: attachedCards }, index) => {
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
            size={density.size}
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
            hostExhausted={Boolean(unit.isExhausted)}
            size={density.size}
            host={hostTile}
            attachments={attachedCards.map((attachment, attachmentIndex) => ({
              id: attachment.instanceId ?? `${attachment.name}-${attachmentIndex}`,
              card: <CardTile
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
                  size={density.size}
                  {...attachment}
                />,
            }))}
          />
        );
      })}
    </motion.div>
    </BoardScrollArea>
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
      className="relative flex h-[120px] w-[86px] shrink-0 items-start justify-center overflow-hidden"
      data-testid="facedown-zone"
    >
      <CardTile
        {...(card ?? {})}
        size="md"
        name={card?.name ?? "Facedown card"}
        img={card?.img ?? cardBackImage.src}
        type={card?.type ?? "Facedown"}
        isHighlighted={card?.instanceId ? highlightedCardInstanceIds?.has(card.instanceId) : false}
        isTransferHidden={card?.instanceId ? hiddenCardInstanceIds?.has(card.instanceId) : false}
        onPrimaryAction={card && onCardPrimaryAction ? (event) => onCardPrimaryAction(card, event) : undefined}
        onHighlightPointerEnter={card && onCardPointerEnter ? () => onCardPointerEnter(card) : undefined}
        onHighlightPointerLeave={card && onCardPointerLeave ? () => onCardPointerLeave(card) : undefined}
      />
      <span className="top-1 left-1 z-30 absolute rounded bg-fuchsia-950/90 px-1 text-[8px] font-semibold tracking-wide text-fuchsia-50">HIDDEN</span>
    </div>
  );
}

function BattlefieldStatusLane({
  battlefieldId,
  card,
  hasMight,
  highlightedCardInstanceIds,
  hiddenCardInstanceIds,
  might,
  onCardPointerEnter,
  onCardPointerLeave,
  onCardPrimaryAction,
  present,
  side,
}: {
  battlefieldId: string;
  card: Card | null;
  hasMight: boolean;
  highlightedCardInstanceIds?: Set<string>;
  hiddenCardInstanceIds?: Set<string>;
  might: number;
  onCardPointerEnter?: (card: Card) => void;
  onCardPointerLeave?: (card: Card) => void;
  onCardPrimaryAction?: (card: Card, event?: MouseEvent<HTMLDivElement>) => void;
  present: boolean;
  side: "opponent" | "player";
}) {
  return (
    <div className="battlefield-status-lane flex min-h-0 items-center justify-end border-l border-white/15 pl-1" data-battlefield-status-lane={`${battlefieldId}:${side}`}>
      {present ? (
        <BattlefieldFacedownZone
          card={card}
          isPresent
          highlightedCardInstanceIds={highlightedCardInstanceIds}
          hiddenCardInstanceIds={hiddenCardInstanceIds}
          onCardPointerEnter={onCardPointerEnter}
          onCardPointerLeave={onCardPointerLeave}
          onCardPrimaryAction={onCardPrimaryAction}
        />
      ) : (
        <div aria-hidden="true" className="h-[120px] w-[86px] shrink-0" />
      )}
      {hasMight ? (
        <div className={battlefieldMightBadge()} aria-label={`${side} Might ${might}`}>
          <span className="px-1 py-0.5">{might}</span>
        </div>
      ) : (
        <div aria-hidden="true" className="w-[30px] shrink-0" />
      )}
    </div>
  );
}
