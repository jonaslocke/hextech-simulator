"use client";

import { cn } from "@/shared/utils/cn";
import { ArchiveX, Trash2 } from "lucide-react";
import {
  ComponentProps,
  FC,
  MouseEvent,
  ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import cardBackImage from "../../../../assets/cardback.jpg";
import { DraggableLocationCard } from "../drag-and-drop/draggable-location-card";
import type {
  BoardDragSourceLocation,
  BoardLocationDropStatus,
} from "../drag-and-drop/location-drag-actions";
import { useBoardLocationDroppable } from "../drag-and-drop/use-board-location-droppable";
import { Card, PlayerData, ZoneData } from "../types";
import { boardCardSize, classifyBaseGroup, orderBaseGroups, resolveBaseDensity, resolveRuneFan, type BoardGeometryProfile } from "../board-geometry";
import { useBoardGeometryProfile } from "../use-board-geometry-profile";
import { CardTile } from "./card-tile";
import type { CardTileSize } from "./card-tile";
import { AttachmentCardGroup } from "./attachment-card-group";
import { groupCardsByAttachment } from "./attachment-layout";
import { ZoneArea } from "./zone-area";
import { BoardScrollArea } from "./board-scroll-area";

type BaseLineProps = {
  enableLocationDrag?: boolean;
  highlightedCardInstanceIds?: Set<string>;
  hiddenCardInstanceIds?: Set<string>;
  isBaseHighlighted?: boolean;
  player: PlayerData;
  isHightlighted: ComponentProps<typeof ZoneArea>["isHightlighted"];
  stagedMovementCardInstanceIds?: Set<string>;
  onChampionContextAction?: (
    card: Card,
    event: MouseEvent<HTMLDivElement>,
  ) => void;
  onChampionPrimaryAction?: (
    card: Card,
    event?: MouseEvent<HTMLDivElement>,
  ) => void;
  onBoardCardPrimaryAction?: (
    card: Card,
    event?: MouseEvent<HTMLDivElement>,
  ) => void;
  onBoardCardPointerEnter?: (card: Card) => void;
  onBoardCardPointerLeave?: (card: Card) => void;
  baseDropStatus?: BoardLocationDropStatus;
  isLocationDropEnabled?: boolean;
};

type Props = {
  enableLocationDrag?: boolean;
  highlightedCardInstanceIds?: Set<string>;
  hiddenCardInstanceIds?: Set<string>;
  isBaseHighlighted?: boolean;
  isMirrored?: boolean;
  stagedMovementCardInstanceIds?: Set<string>;
  onChampionContextAction?: (
    card: Card,
    event: MouseEvent<HTMLDivElement>,
  ) => void;
  onChampionPrimaryAction?: (
    card: Card,
    event?: MouseEvent<HTMLDivElement>,
  ) => void;
  onBoardCardPrimaryAction?: (
    card: Card,
    event?: MouseEvent<HTMLDivElement>,
  ) => void;
  onBoardCardPointerEnter?: (card: Card) => void;
  onBoardCardPointerLeave?: (card: Card) => void;
  onRuneContextAction?: (card: Card, event: MouseEvent<HTMLDivElement>) => void;
  onRunePrimaryAction?: (card: Card) => void;
  onOpenBanish?: () => void;
  onOpenTrash?: () => void;
  player: PlayerData;
  isActivePlayer: boolean;
  baseDropStatus?: BoardLocationDropStatus;
  isLocationDropEnabled?: boolean;
};

const BaseLine = ({
  enableLocationDrag = false,
  highlightedCardInstanceIds,
  hiddenCardInstanceIds,
  isBaseHighlighted,
  player,
  isHightlighted,
  onChampionContextAction,
  onChampionPrimaryAction,
  onBoardCardPrimaryAction,
  onBoardCardPointerEnter,
  onBoardCardPointerLeave,
  baseDropStatus = "idle",
  isLocationDropEnabled = false,
  stagedMovementCardInstanceIds,
}: BaseLineProps) => {
  const profile = useBoardGeometryProfile();
  const baseUnits = player.zones.base.cards.filter(
    (card) => card.type !== "Rune",
  );
  const hasChampionZone =
    player.zones.champion.cards.length > 0 || player.zones.champion.count > 0;
  const baseUnitsDroppable = useBoardLocationDroppable({
    disabled: !isLocationDropEnabled,
    droppableId: `${player.playerId}:base-units`,
    location: { kind: "base" },
  });

  return (
    <div
      className={cn(
        "contents",
      )}
    >
      {hasChampionZone && (
      <ZoneArea
        animationZoneId={`${player.playerId}:champion`}
        className="board-zone board-zone-fixed"
        contentClassName="board-zone-content"
        isCentered
          isHightlighted={isHightlighted}
        >
          <ZoneCards
            dragSourceLocation={
              enableLocationDrag ? { kind: "champion" } : undefined
            }
            highlightedCardInstanceIds={highlightedCardInstanceIds}
            hiddenCardInstanceIds={hiddenCardInstanceIds}
            onCardContextAction={onChampionContextAction}
          onCardPrimaryAction={onChampionPrimaryAction}
          cardSize={boardCardSize(profile, "champion")}
          zone={player.zones.champion}
          />
        </ZoneArea>
      )}
      <ZoneArea
        animationZoneId={`${player.playerId}:legend`}
        className="board-zone board-zone-fixed"
        contentClassName="board-zone-content"
        isCentered
        isHightlighted={isHightlighted}
      >
        <ZoneCards
          highlightedCardInstanceIds={highlightedCardInstanceIds}
          hiddenCardInstanceIds={hiddenCardInstanceIds}
          onCardPrimaryAction={onBoardCardPrimaryAction}
          onCardContextAction={onBoardCardPrimaryAction}
          cardSize={boardCardSize(profile, "legend")}
          zone={player.zones.legend}
        />
      </ZoneArea>
      <ZoneArea
        animationZoneId={`${player.playerId}:base`}
        className="board-zone board-zone-base"
        contentClassName="board-zone-content"
        dropStatus={baseDropStatus}
        isDestinationHighlighted={isBaseHighlighted}
        isHightlighted={isBaseHighlighted || isHightlighted}
        ref={baseUnitsDroppable.setNodeRef}
      >
        <BasePermanentList
          cards={baseUnits}
          dragSourceLocation={enableLocationDrag ? { kind: "base" } : undefined}
          highlightedCardInstanceIds={highlightedCardInstanceIds}
          hiddenCardInstanceIds={hiddenCardInstanceIds}
          layout="wrap"
          onCardPrimaryAction={onBoardCardPrimaryAction}
          onCardPointerEnter={onBoardCardPointerEnter}
          onCardPointerLeave={onBoardCardPointerLeave}
          showMight
          stagedMovementCardInstanceIds={stagedMovementCardInstanceIds}
        />
      </ZoneArea>
      <ZoneArea
        animationZoneId={`${player.playerId}:mainDeck`}
        className="board-zone board-zone-fixed"
        contentClassName="board-zone-content"
        isCentered
        isHightlighted={isHightlighted}
      >
        <HiddenZone count={player.zones.mainDeck.count} label="Main deck" size="md" />
      </ZoneArea>
    </div>
  );
};

interface RunesProps extends BaseLineProps {
  onRuneContextAction?: (card: Card, event: MouseEvent<HTMLDivElement>) => void;
  onRunePrimaryAction?: (card: Card) => void;
  onOpenBanish?: () => void;
  onOpenTrash?: () => void;
}

const RunesLine = ({
  baseDropStatus = "idle",
  highlightedCardInstanceIds,
  hiddenCardInstanceIds,
  isBaseHighlighted,
  isLocationDropEnabled = false,
  onRuneContextAction,
  onRunePrimaryAction,
  onOpenBanish,
  onOpenTrash,
  player,
  isHightlighted,
}: RunesProps) => {
  const profile = useBoardGeometryProfile();
  const baseRunes = player.zones.base.cards.filter(
    (card) => card.type === "Rune",
  );
  const runeCounts = countRuneReadiness(baseRunes);

  const baseRunesDroppable = useBoardLocationDroppable({
    disabled: !isLocationDropEnabled,
    droppableId: `${player.playerId}:base-runes`,
    location: { kind: "base" },
  });

  return (
    <div
      className={cn(
        "contents",
      )}
    >
      <ZoneArea
        animationZoneId={`${player.playerId}:runeDeck`}
        className="board-zone board-zone-fixed"
        contentClassName="board-zone-content"
        isCentered
        isHightlighted={isHightlighted}
      >
        <HiddenZone count={player.zones.runeDeck.count} label="Rune deck" />
      </ZoneArea>
      <ZoneArea
        animationZoneId={`${player.playerId}:base`}
        className="board-zone board-zone-runes"
        contentClassName="board-zone-content"
        dropStatus={baseDropStatus}
        isDestinationHighlighted={isBaseHighlighted}
        isHightlighted={isBaseHighlighted || isHightlighted}
        ref={baseRunesDroppable.setNodeRef}
        totalCardsCount={runeCounts}
      >
        <CardList
          cards={baseRunes}
          highlightedCardInstanceIds={highlightedCardInstanceIds}
          hiddenCardInstanceIds={hiddenCardInstanceIds}
          layout="fan"
          geometryProfile={profile}
          onCardContextAction={onRuneContextAction}
          onCardPrimaryAction={onRunePrimaryAction}
          showMight={false}
        />
      </ZoneArea>
      <ZoneArea animationZoneId={`${player.playerId}:trash`} className="board-zone board-zone-fixed" contentClassName="board-zone-content" isCentered isHightlighted={isHightlighted}>
        <TrashBanishmentTrack
          highlightedCardInstanceIds={highlightedCardInstanceIds}
          hiddenCardInstanceIds={hiddenCardInstanceIds}
          onOpenBanish={onOpenBanish}
          onOpenTrash={onOpenTrash}
          player={player}
        />
      </ZoneArea>
    </div>
  );
};

function countRuneReadiness(cards: Card[]) {
  return cards.reduce(
    (counts, card) => {
      if (card.isExhausted) {
        return {
          ...counts,
          total: counts.total + 1,
        };
      }

      return {
        ...counts,
        ready: counts.ready + 1,
        total: counts.total + 1,
      };
    },
    { ready: 0, total: 0 },
  );
}

export const PlayerBoard: FC<Props> = ({
  enableLocationDrag = false,
  highlightedCardInstanceIds,
  hiddenCardInstanceIds,
  isBaseHighlighted,
  isMirrored,
  onChampionContextAction,
  onChampionPrimaryAction,
  onBoardCardPrimaryAction,
  onBoardCardPointerEnter,
  onBoardCardPointerLeave,
  onRuneContextAction,
  onRunePrimaryAction,
  onOpenBanish,
  onOpenTrash,
  player,
  isActivePlayer,
  baseDropStatus = "idle",
  isLocationDropEnabled = false,
  stagedMovementCardInstanceIds,
}) => {
  const hasChampion = player.zones.champion.cards.length > 0 || player.zones.champion.count > 0;
  const boardClass = cn("player-board-band grid min-w-0 min-h-0 h-full", isMirrored && "[direction:rtl]");
  if (isMirrored) {
    return (
      <div className={cn(boardClass, hasChampion ? "has-champion" : "") } data-player-board-band={player.playerId}>
        <BaseLine
          enableLocationDrag={enableLocationDrag}
          highlightedCardInstanceIds={highlightedCardInstanceIds}
          hiddenCardInstanceIds={hiddenCardInstanceIds}
          isBaseHighlighted={isBaseHighlighted}
          onChampionContextAction={onChampionContextAction}
          onChampionPrimaryAction={onChampionPrimaryAction}
          onBoardCardPrimaryAction={onBoardCardPrimaryAction}
          onBoardCardPointerEnter={onBoardCardPointerEnter}
          onBoardCardPointerLeave={onBoardCardPointerLeave}
          player={player}
          isHightlighted={isActivePlayer}
        />
        <RunesLine
          highlightedCardInstanceIds={highlightedCardInstanceIds}
          hiddenCardInstanceIds={hiddenCardInstanceIds}
          isBaseHighlighted={isBaseHighlighted}
          onOpenBanish={onOpenBanish}
          onOpenTrash={onOpenTrash}
          player={player}
          isHightlighted={isActivePlayer}
        />
      </div>
    );
  }
  return (
    <div className={cn(boardClass, hasChampion ? "has-champion" : "")} data-player-board-band={player.playerId}>
      <BaseLine
        baseDropStatus={baseDropStatus}
        enableLocationDrag={enableLocationDrag}
        highlightedCardInstanceIds={highlightedCardInstanceIds}
        hiddenCardInstanceIds={hiddenCardInstanceIds}
        isBaseHighlighted={isBaseHighlighted}
        isLocationDropEnabled={isLocationDropEnabled}
        onChampionContextAction={onChampionContextAction}
        onChampionPrimaryAction={onChampionPrimaryAction}
        onBoardCardPrimaryAction={onBoardCardPrimaryAction}
        onBoardCardPointerEnter={onBoardCardPointerEnter}
        onBoardCardPointerLeave={onBoardCardPointerLeave}
        player={player}
        isHightlighted={isActivePlayer}
        stagedMovementCardInstanceIds={stagedMovementCardInstanceIds}
      />
      <RunesLine
        baseDropStatus={baseDropStatus}
        highlightedCardInstanceIds={highlightedCardInstanceIds}
        hiddenCardInstanceIds={hiddenCardInstanceIds}
        isBaseHighlighted={isBaseHighlighted}
        isLocationDropEnabled={isLocationDropEnabled}
        onRuneContextAction={onRuneContextAction}
        onRunePrimaryAction={onRunePrimaryAction}
        onOpenBanish={onOpenBanish}
        onOpenTrash={onOpenTrash}
        player={player}
        isHightlighted={isActivePlayer}
      />
    </div>
  );
};

function ZoneCards({
  dragSourceLocation,
  highlightedCardInstanceIds,
  hiddenCardInstanceIds,
  onCardContextAction,
  onCardPrimaryAction,
  onCardPointerEnter,
  onCardPointerLeave,
  onClick,
  showCount = false,
  showMight = false,
  cardSize = "md",
  zone,
}: {
  dragSourceLocation?: BoardDragSourceLocation;
  highlightedCardInstanceIds?: Set<string>;
  hiddenCardInstanceIds?: Set<string>;
  onCardContextAction?: (card: Card, event: MouseEvent<HTMLDivElement>) => void;
  onCardPrimaryAction?: (
    card: Card,
    event?: MouseEvent<HTMLDivElement>,
  ) => void;
  onCardPointerEnter?: (card: Card) => void;
  onCardPointerLeave?: (card: Card) => void;
  onClick?: () => void;
  showCount?: boolean;
  showMight?: boolean;
  cardSize?: CardTileSize;
  zone: ZoneData;
}) {
  if (zone.cards.length > 0) {
    return (
      <CardList
        cards={zone.cards}
        count={showCount ? zone.count : undefined}
        dragSourceLocation={dragSourceLocation}
        highlightedCardInstanceIds={highlightedCardInstanceIds}
        hiddenCardInstanceIds={hiddenCardInstanceIds}
        onCardContextAction={onCardContextAction}
        onCardPrimaryAction={onCardPrimaryAction}
        onCardPointerEnter={onCardPointerEnter}
        onCardPointerLeave={onCardPointerLeave}
        onClick={onClick}
        cardSize={cardSize}
        showMight={showMight}
      />
    );
  }

  if (zone.count > 0) {
    return <HiddenZone count={zone.count} label={zone.kind} size={cardSize} />;
  }

  return null;
}

function TrashBanishmentTrack({
  highlightedCardInstanceIds,
  hiddenCardInstanceIds,
  onOpenBanish,
  onOpenTrash,
  player,
}: {
  highlightedCardInstanceIds?: Set<string>;
  hiddenCardInstanceIds?: Set<string>;
  onOpenBanish?: () => void;
  onOpenTrash?: () => void;
  player: PlayerData;
}) {
  const trash = player.zones.trash;
  const banishment = player.zones.banishment;
  const latestTrash = trash.cards.at(-1);
  const latestBanished = banishment.cards.at(-1);
  const preview = (card: Card | undefined, label: string, count: number, hidden: boolean) => (
    <>
      <div className="absolute inset-0 overflow-hidden">
        {card ? (
          <CardTile
            enableHoverPreview
            isHighlighted={card.instanceId ? highlightedCardInstanceIds?.has(card.instanceId) : false}
            isTransferHidden={card.instanceId ? hiddenCardInstanceIds?.has(card.instanceId) : false}
            size="md"
            showMight={false}
            {...card}
          />
        ) : hidden ? (
          <CardTile img={cardBackImage.src} name={label} size="md" showMight={false} />
        ) : null}
      </div>
      {!card && !hidden && <span aria-hidden="true" className="absolute inset-0 grid place-items-center"><Trash2 className="size-5" /></span>}
      <span className="right-1 bottom-1 z-20 absolute rounded bg-yellow-300 px-1 font-bold text-[10px] text-black">{count}</span>
      <span className="sr-only">{label}</span>
    </>
  );

  return (
    <div className="grid grid-rows-2 w-[86px] h-[120px] overflow-hidden">
      <button aria-label={`Open trash, ${trash.count} cards`} className="relative block min-h-0 overflow-hidden" onClick={onOpenTrash} type="button">
        {preview(latestTrash, `${player.name} trash`, trash.count, false)}
      </button>
      <button aria-label={`Open banishment, ${banishment.count} cards`} className="relative block min-h-0 overflow-hidden border-t border-white/60" data-zone-animation-id={`${player.playerId}:banishment`} onClick={onOpenBanish} type="button">
        {preview(latestBanished, `${player.name} banishment`, banishment.count, banishment.count > 0)}
        <ArchiveX aria-hidden="true" className="top-1 right-1 z-20 absolute size-3 text-white drop-shadow" />
      </button>
    </div>
  );
}

type CardListProps = {
  cards: Card[];
  count?: number;
  dragSourceLocation?: BoardDragSourceLocation;
  highlightedCardInstanceIds?: Set<string>;
  hiddenCardInstanceIds?: Set<string>;
  onCardContextAction?: (card: Card, event: MouseEvent<HTMLDivElement>) => void;
  onCardPrimaryAction?: (
    card: Card,
    event?: MouseEvent<HTMLDivElement>,
  ) => void;
  onCardPointerEnter?: (card: Card) => void;
  onCardPointerLeave?: (card: Card) => void;
  onClick?: () => void;
  layout?: "row" | "scroll" | "wrap" | "fan";
  cardSize?: CardTileSize;
  geometryProfile?: BoardGeometryProfile;
  showMight?: boolean;
  stagedMovementCardInstanceIds?: Set<string>;
};

function CardList({ cards, ...props }: CardListProps) {
  if (props.layout === "fan") {
    return <RuneFan cards={cards} {...props} />;
  }
  return (
    <CardListLayout cards={cards} {...props}>
      {cards.map((card, index) => (
        <CardListCard key={card.instanceId ?? `${card.name}-${index}`} card={card} {...props} />
      ))}
    </CardListLayout>
  );
}

// Attachment relationships affect only Base permanents, never generic zones.
function BasePermanentList({ cards, ...props }: CardListProps) {
  const profile = useBoardGeometryProfile();
  const [usableWidth, setUsableWidth] = useState(0);
  const cardGroups = groupCardsByAttachment(cards)
    .map(({ host, attachments }, index) => ({
      host,
      attachments,
      key: host.instanceId ?? `${host.name}-${index}`,
      kind: classifyBaseGroup(host),
      exhausted: Boolean(host.isExhausted),
      attachmentCount: attachments.length,
      originalIndex: index,
    }));
  const groups = orderBaseGroups(cardGroups);
  const density = resolveBaseDensity({
    usableWidth,
    groups,
    profile,
  });

  if (groups.length === 0) return null;
  return (
    <BoardScrollArea
      ariaLabel="Base permanents"
      className="w-full h-full"
      contentClassName={cn("max-h-full", density.wraps ? "overflow-y-auto" : "overflow-y-hidden")}
      onViewportWidthChange={setUsableWidth}
      scrollable={density.wraps}
    >
      <div className={cn("flex w-full min-h-full min-w-0", density.wraps ? "flex-wrap content-start" : "items-center content-center")} data-base-density={`${density.size}/${density.gap}${density.wraps ? "/wrap" : ""}`} style={{ columnGap: density.gap, rowGap: density.wraps ? 6 : 0 }}>
      {groups.map(({ host, attachments, key }) => {
        if (attachments.length === 0) {
          return <CardListCard key={key} card={host} {...props} cardSize={density.size} />;
        }
        return (
          <AttachmentCardGroup
            key={key}
            groupId={key}
            hostExhausted={Boolean(host.isExhausted)}
            size={density.size}
            host={<CardListCard card={host} {...props} cardSize={density.size} />}
            attachments={attachments.map((card, attachmentIndex) => ({
              id: card.instanceId ?? `${card.name}-${attachmentIndex}`,
              card: <CardListCard card={card} {...props} cardSize={density.size} dragSourceLocation={undefined} />,
            }))}
          />
        );
      })}
      </div>
    </BoardScrollArea>
  );
}

function RuneFan({ cards, geometryProfile = "reference", ...props }: CardListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [usableWidth, setUsableWidth] = useState(0);
  const density = resolveRuneFan({ usableWidth, profile: geometryProfile });
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const update = () => setUsableWidth(container.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);
  if (cards.length === 0) return null;
  return (
    <div className="relative w-full h-full min-w-0 overflow-hidden" data-rune-density={`${density.size}/${density.step}`} ref={containerRef}>
      {cards.map((card, index) => (
        <div className="top-0 absolute" key={card.instanceId ?? `${card.name}-${index}`} style={{ left: index * density.step, zIndex: index }}>
          <CardListCard card={card} {...props} cardSize={density.size} />
        </div>
      ))}
    </div>
  );
}

function CardListCard({
  card,
  dragSourceLocation,
  highlightedCardInstanceIds,
  hiddenCardInstanceIds,
  onCardContextAction,
  onCardPrimaryAction,
  onCardPointerEnter,
  onCardPointerLeave,
  onClick,
  showMight = false,
  cardSize = "md",
  stagedMovementCardInstanceIds,
}: Omit<CardListProps, "cards"> & { card: Card }) {
  const tile = (
    <CardTile
      enableHoverPreview={!onClick}
      isHighlighted={card.instanceId ? highlightedCardInstanceIds?.has(card.instanceId) : false}
      isTransferHidden={card.instanceId ? hiddenCardInstanceIds?.has(card.instanceId) : false}
      onContextAction={onCardContextAction ? (event) => onCardContextAction(card, event) : undefined}
      onPrimaryAction={onCardPrimaryAction ? (event) => onCardPrimaryAction(card, event) : undefined}
      onHighlightPointerEnter={onCardPointerEnter ? () => onCardPointerEnter(card) : undefined}
      onHighlightPointerLeave={onCardPointerLeave ? () => onCardPointerLeave(card) : undefined}
      showMight={showMight}
      size={cardSize}
      isStagedForMovement={card.instanceId ? stagedMovementCardInstanceIds?.has(card.instanceId) : false}
      {...card}
    />
  );
  return !dragSourceLocation || !card.instanceId || !card.type?.split(" / ").includes("Unit") ? <div>{tile}</div> : (
    <DraggableLocationCard cardInstanceId={card.instanceId} sourceLocation={dragSourceLocation}>
      {tile}
    </DraggableLocationCard>
  );
}

function CardListLayout({
  cards,
  children,
  count,
  onClick,
  layout = "row",
}: Pick<CardListProps, "cards" | "count" | "onClick" | "layout"> & { children: ReactNode }) {
  const wrapContainerRef = useRef<HTMLDivElement>(null);
  const [hasWrappedRows, setHasWrappedRows] = useState(false);

  useEffect(() => {
    if (layout !== "wrap" || !wrapContainerRef.current) {
      setHasWrappedRows(false);
      return;
    }

    const container = wrapContainerRef.current;
    let frameId = 0;

    const updateWrapState = () => {
      const cardElements = Array.from(container.children).filter(
        (child) => child.tagName === "DIV",
      );

      if (cardElements.length < 2) {
        setHasWrappedRows(false);
        return;
      }

      const firstTop = cardElements[0].getBoundingClientRect().top;
      const wrapped = cardElements.some(
        (element) =>
          Math.abs(element.getBoundingClientRect().top - firstTop) > 4,
      );

      setHasWrappedRows(wrapped);
    };

    const scheduleUpdate = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(updateWrapState);
    };

    scheduleUpdate();

    const resizeObserver = new ResizeObserver(scheduleUpdate);
    resizeObserver.observe(container);

    for (const child of Array.from(container.children)) {
      resizeObserver.observe(child);
    }

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
    };
  }, [children, layout]);

  if (cards.length === 0) {
    return null;
  }

  const content = (
    <>
      {children}
      {count !== undefined && count > 0 && (
        <span className="top-1 right-1 z-20 absolute bg-yellow-300 px-1.5 py-0.5 rounded font-bold text-black text-xs">
          {count}
        </span>
      )}
    </>
  );

  if (!onClick && count === undefined && layout === "row") {
    return content;
  }

  if (!onClick && layout === "wrap") {
    return (
      <div
        className={cn(
          "flex flex-wrap items-start gap-2 py-2 pr-1 w-full h-full max-h-full overflow-x-hidden overflow-y-auto",
          hasWrappedRows ? "content-start" : "content-center",
        )}
        ref={wrapContainerRef}
      >
        {content}
      </div>
    );
  }

  if (!onClick && layout === "scroll") {
    return (
      <div className="relative flex items-center gap-2 py-2 pr-1 w-full min-w-0 max-w-full overflow-x-auto overflow-y-hidden">
        {content}
      </div>
    );
  }

  if (!onClick) {
    return <div className="relative flex gap-2">{content}</div>;
  }

  return (
    <button
      aria-label={`Open ${cards[0]?.name ?? "zone"}`}
      className="relative flex gap-2"
      onClick={onClick}
      type="button"
    >
      {content}
    </button>
  );
}

function HiddenZone({ count, label, size = "md" }: { count: number; label: string; size?: CardTileSize }) {
  return (
    <div className="relative">
      <CardTile img={cardBackImage.src} name={label} size={size} />
      <span className="-top-2 left-1/2 z-30 absolute bg-[#111827] shadow-black/50 shadow-md px-1.5 py-0.5 rounded font-bold text-xs -translate-x-1/2">
        {count}
      </span>
    </div>
  );
}
