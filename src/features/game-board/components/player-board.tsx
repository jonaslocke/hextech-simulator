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
  type CSSProperties,
} from "react";
import cardBackImage from "../../../../assets/cardback.jpg";
import { DraggableLocationCard } from "../drag-and-drop/draggable-location-card";
import type {
  BoardDragSourceLocation,
  BoardLocationDropStatus,
} from "../drag-and-drop/location-drag-actions";
import { useBoardLocationDroppable } from "../drag-and-drop/use-board-location-droppable";
import { Card, PlayerData, ZoneData } from "../types";
import { CARD_TILE_SIZE_CONFIG, CardTile, type CardTileSize } from "./card-tile";
import { AttachmentCardGroup } from "./attachment-card-group";
import { groupCardsByAttachment } from "./attachment-layout";
import { ZoneArea } from "./zone-area";

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
  const baseUnits = orderBasePermanents(
    player.zones.base.cards.filter((card) => card.type !== "Rune"),
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
        "gap-2 grid min-h-0",
        hasChampionZone &&
          "grid-cols-[var(--board-champion-width)_var(--board-legend-width)_minmax(0,1fr)_var(--board-pile-width)]",
        !hasChampionZone &&
          "grid-cols-[var(--board-legend-width)_minmax(0,1fr)_var(--board-pile-width)]",
      )}
    >
      {hasChampionZone && (
        <ZoneArea
          animationZoneId={`${player.playerId}:champion`}
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
            size="lg"
            zone={player.zones.champion}
          />
        </ZoneArea>
      )}
      <ZoneArea
        animationZoneId={`${player.playerId}:legend`}
        isCentered
        isHightlighted={isHightlighted}
      >
        <ZoneCards
          highlightedCardInstanceIds={highlightedCardInstanceIds}
          hiddenCardInstanceIds={hiddenCardInstanceIds}
          onCardPrimaryAction={onBoardCardPrimaryAction}
          onCardContextAction={onBoardCardPrimaryAction}
          size="xl"
          zone={player.zones.legend}
        />
      </ZoneArea>
      <ZoneArea
        animationZoneId={`${player.playerId}:base`}
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
          size="lg"
          onCardPrimaryAction={onBoardCardPrimaryAction}
          onCardPointerEnter={onBoardCardPointerEnter}
          onCardPointerLeave={onBoardCardPointerLeave}
          showMight
          stagedMovementCardInstanceIds={stagedMovementCardInstanceIds}
        />
      </ZoneArea>
      <ZoneArea
        animationZoneId={`${player.playerId}:mainDeck`}
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
    <div className="gap-2 grid grid-cols-[var(--board-pile-width)_minmax(0,1fr)_var(--board-pile-width)] min-h-0">
      <ZoneArea
        animationZoneId={`${player.playerId}:runeDeck`}
        isCentered
        isHightlighted={isHightlighted}
      >
        <HiddenZone count={player.zones.runeDeck.count} label="Rune deck" />
      </ZoneArea>
      <ZoneArea
        animationZoneId={`${player.playerId}:base`}
        dropStatus={baseDropStatus}
        isDestinationHighlighted={isBaseHighlighted}
        isHightlighted={isBaseHighlighted || isHightlighted}
        ref={baseRunesDroppable.setNodeRef}
        totalCardsCount={runeCounts}
      >
        <RuneFan
          cards={baseRunes}
          highlightedCardInstanceIds={highlightedCardInstanceIds}
          hiddenCardInstanceIds={hiddenCardInstanceIds}
          onCardContextAction={onRuneContextAction}
          onCardPrimaryAction={onRunePrimaryAction}
        />
      </ZoneArea>
      <ZoneArea
        animationZoneId={`${player.playerId}:trash`}
        isCentered
        isHightlighted={isHightlighted}
      >
        <TrashBanishZone
          highlightedCardInstanceIds={highlightedCardInstanceIds}
          hiddenCardInstanceIds={hiddenCardInstanceIds}
          onOpenTrash={onOpenTrash}
          onOpenBanish={onOpenBanish}
          trash={player.zones.trash}
          banishment={player.zones.banishment}
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
  if (isMirrored) {
    return (
      <>
        <RunesLine
          highlightedCardInstanceIds={highlightedCardInstanceIds}
          hiddenCardInstanceIds={hiddenCardInstanceIds}
          isBaseHighlighted={isBaseHighlighted}
          onOpenBanish={onOpenBanish}
          onOpenTrash={onOpenTrash}
          player={player}
          isHightlighted={isActivePlayer}
        />
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
      </>
    );
  }
  return (
    <>
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
    </>
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
  size = "md",
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
  size?: CardTileSize;
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
        showMight={showMight}
        size={size}
      />
    );
  }

  if (zone.count > 0) {
    return <HiddenZone count={zone.count} label={zone.kind} size={size} />;
  }

  return null;
}

function TrashBanishZone({
  highlightedCardInstanceIds,
  hiddenCardInstanceIds,
  onOpenTrash,
  onOpenBanish,
  trash,
  banishment,
}: {
  highlightedCardInstanceIds?: Set<string>;
  hiddenCardInstanceIds?: Set<string>;
  onOpenTrash?: () => void;
  onOpenBanish?: () => void;
  trash: ZoneData;
  banishment: ZoneData;
}) {
  const isSplit = banishment.count > 0;
  return (
    <div className="w-[86px] h-[120px] overflow-hidden">
      <PilePreview
        icon={<Trash2 className="size-4" />}
        count={trash.count}
        card={trash.cards.at(-1)}
        label="Trash"
        onClick={onOpenTrash}
        highlightedCardInstanceIds={highlightedCardInstanceIds}
        hiddenCardInstanceIds={hiddenCardInstanceIds}
        height={isSplit ? 60 : 120}
      />
      {isSplit && (
        <PilePreview
          icon={<ArchiveX className="size-4" />}
          count={banishment.count}
          card={banishment.cards.at(-1)}
          label="Banishment"
          onClick={onOpenBanish}
          highlightedCardInstanceIds={highlightedCardInstanceIds}
          hiddenCardInstanceIds={hiddenCardInstanceIds}
          height={60}
          separated
        />
      )}
    </div>
  );
}

function orderBasePermanents(cards: Card[]) {
  const group = (card: Card) => {
    const types = card.type?.split(" / ") ?? [];
    if (types.includes("Unit")) return 1;
    if (types.includes("Gear") && !types.includes("Unit")) return 0;
    if (types.includes("Equipment")) return 2;
    return 1;
  };
  return cards
    .map((card, arrivalIndex) => ({ card, arrivalIndex, group: group(card) }))
    .sort((left, right) => left.group - right.group || left.arrivalIndex - right.arrivalIndex)
    .map(({ card }) => card);
}

function RuneFan({
  cards,
  highlightedCardInstanceIds,
  hiddenCardInstanceIds,
  onCardContextAction,
  onCardPrimaryAction,
}: {
  cards: Card[];
  highlightedCardInstanceIds?: Set<string>;
  hiddenCardInstanceIds?: Set<string>;
  onCardContextAction?: (card: Card, event: MouseEvent<HTMLDivElement>) => void;
  onCardPrimaryAction?: (card: Card) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ size: "lg" as CardTileSize, step: 32 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const update = () => {
      const availableWidth = container.clientWidth;
      const sizeForWidth = (size: CardTileSize) => {
        const dimensions = cards.map((card) => {
          const tile = CARD_TILE_SIZE_CONFIG[size];
          return card.isExhausted ? tile.height : tile.width;
        });
        const widestCard = Math.max(0, ...dimensions);
        const maximumStep = cards.length > 1
          ? Math.floor((availableWidth - widestCard) / (cards.length - 1))
          : 32;
        return { step: Math.min(32, maximumStep), widestCard };
      };

      const large = sizeForWidth("lg");
      if (large.step >= 24 || cards.length <= 1) {
        setLayout({ size: "lg", step: Math.max(24, large.step) });
        return;
      }
      const medium = sizeForWidth("md");
      setLayout({ size: "md", step: Math.max(24, medium.step) });
    };

    update();
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [cards]);

  const dimensions = CARD_TILE_SIZE_CONFIG[layout.size];
  const width = cards.length === 0
    ? 0
    : (cards.length - 1) * layout.step + Math.max(...cards.map((card) =>
        card.isExhausted ? dimensions.height : dimensions.width,
      ));
  return (
    <div className="relative w-full h-full min-h-0 overflow-visible" ref={containerRef} data-rune-fan>
      <div className="relative h-full" style={{ width: Math.min(width, containerRef.current?.clientWidth ?? width) }}>
        {cards.map((card, index) => {
          const footprintWidth = card.isExhausted ? dimensions.height : dimensions.width;
          const footprintHeight = card.isExhausted ? dimensions.width : dimensions.height;
          const style = {
            left: index * layout.step,
            width: footprintWidth,
            height: footprintHeight,
            zIndex: index + 1,
          } satisfies CSSProperties;
          return (
            <div className="top-1/2 absolute -translate-y-1/2" key={card.instanceId ?? `${card.name}-${index}`} style={style}>
              <CardTile
                isHighlighted={card.instanceId ? highlightedCardInstanceIds?.has(card.instanceId) : false}
                isTransferHidden={card.instanceId ? hiddenCardInstanceIds?.has(card.instanceId) : false}
                onContextAction={onCardContextAction ? (event) => onCardContextAction(card, event) : undefined}
                onPrimaryAction={onCardPrimaryAction ? () => onCardPrimaryAction(card) : undefined}
                size={layout.size}
                showMight={false}
                {...card}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PilePreview({
  card,
  count,
  height,
  hiddenCardInstanceIds,
  highlightedCardInstanceIds,
  icon,
  label,
  onClick,
  separated = false,
}: {
  card?: Card;
  count: number;
  height: number;
  hiddenCardInstanceIds?: Set<string>;
  highlightedCardInstanceIds?: Set<string>;
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  separated?: boolean;
}) {
  return (
    <button
      aria-label={`Open ${label.toLowerCase()}, ${count} cards`}
      className={cn("relative block w-[86px] overflow-hidden bg-slate-950/75 text-slate-100", separated && "border-white/40 border-t")}
      onClick={onClick}
      style={{ height }}
      title={`${count} cards in ${label.toLowerCase()}`}
      type="button"
    >
      {card ? (
        <div className="top-0 left-0 absolute pointer-events-none">
          <CardTile
            enableHoverPreview={height === 120}
            isHighlighted={card.instanceId ? highlightedCardInstanceIds?.has(card.instanceId) : false}
            isTransferHidden={card.instanceId ? hiddenCardInstanceIds?.has(card.instanceId) : false}
            size="md"
            showMight={false}
            {...card}
          />
        </div>
      ) : null}
      <span className="bottom-1 left-1 z-20 absolute flex items-center gap-1 bg-slate-950/80 px-1 rounded text-[10px] text-white">
        {icon}
        <span className="flex justify-center items-center bg-yellow-300 rounded-full min-w-4 h-4 font-bold text-black">{count}</span>
      </span>
    </button>
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
  layout?: "row" | "scroll" | "wrap";
  size?: CardTileSize;
  showMight?: boolean;
  stagedMovementCardInstanceIds?: Set<string>;
};

function CardList({ cards, ...props }: CardListProps) {
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
  return (
    <CardListLayout cards={cards} {...props}>
      {groupCardsByAttachment(cards).map(({ host, attachments }, index) => {
        const key = host.instanceId ?? `${host.name}-${index}`;
        if (attachments.length === 0) {
          return <CardListCard key={key} card={host} {...props} />;
        }
        return (
          <AttachmentCardGroup
            key={key}
            groupId={key}
            size={props.size ?? "md"}
            host={<CardListCard card={host} {...props} />}
            attachments={attachments.map((card, attachmentIndex) => ({
              id: card.instanceId ?? `${card.name}-${attachmentIndex}`,
              card: <CardListCard card={card} {...props} dragSourceLocation={undefined} />,
            }))}
          />
        );
      })}
    </CardListLayout>
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
  size = "md",
  showMight = false,
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
      size={size}
      showMight={showMight}
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
          "flex flex-wrap items-start gap-1 py-2 pr-1 w-full h-full max-h-full overflow-x-hidden overflow-y-auto",
          hasWrappedRows ? "content-start" : "content-center",
        )}
        data-board-scroll
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
      <CardTile size={size} img={cardBackImage.src} name={label} />
      <span className="-top-2 left-1/2 z-30 absolute bg-[#111827] shadow-black/50 shadow-md px-1.5 py-0.5 rounded font-bold text-xs -translate-x-1/2">
        {count}
      </span>
    </div>
  );
}
