"use client";

import {
  ComponentProps,
  FC,
  MouseEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import cardBackImage from "../../../../assets/cardback.jpg";
import { cn } from "@/shared/utils/cn";
import { CardTile } from "./card-tile";
import { ZoneArea } from "./zone-area";
import { ArchiveX, Trash2 } from "lucide-react";
import { Button } from "@/shared/components/button";
import { Card, PlayerData, ZoneData } from "../types";

type BaseLineProps = {
  highlightedCardInstanceIds?: Set<string>;
  hiddenCardInstanceIds?: Set<string>;
  player: PlayerData;
  isHightlighted: ComponentProps<typeof ZoneArea>["isHightlighted"];
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
};

type Props = {
  highlightedCardInstanceIds?: Set<string>;
  hiddenCardInstanceIds?: Set<string>;
  isMirrored?: boolean;
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
};

const BaseLine = ({
  highlightedCardInstanceIds,
  hiddenCardInstanceIds,
  player,
  isHightlighted,
  onChampionContextAction,
  onChampionPrimaryAction,
  onBoardCardPrimaryAction,
  onBoardCardPointerEnter,
  onBoardCardPointerLeave,
}: BaseLineProps) => {
  const baseUnits = player.zones.base.cards.filter(
    (card) => card.type !== "Rune",
  );
  const hasChampionZone =
    player.zones.champion.cards.length > 0 || player.zones.champion.count > 0;

  return (
    <div
      className={cn(
        "gap-2 grid min-h-0",
        hasChampionZone && "grid-cols-[130px_130px_minmax(0,1fr)_130px]",
        !hasChampionZone && "grid-cols-[130px_minmax(0,1fr)_130px]",
      )}
    >
      {hasChampionZone && (
        <ZoneArea
          animationZoneId={`${player.playerId}:champion`}
          isCentered
          isHightlighted={isHightlighted}
        >
          <ZoneCards
            highlightedCardInstanceIds={highlightedCardInstanceIds}
            hiddenCardInstanceIds={hiddenCardInstanceIds}
            onCardContextAction={onChampionContextAction}
            onCardPrimaryAction={onChampionPrimaryAction}
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
          zone={player.zones.legend}
        />
      </ZoneArea>
      <ZoneArea
        animationZoneId={`${player.playerId}:base`}
        isHightlighted={isHightlighted}
      >
        <CardList
          cards={baseUnits}
          highlightedCardInstanceIds={highlightedCardInstanceIds}
          hiddenCardInstanceIds={hiddenCardInstanceIds}
          layout="wrap"
          onCardPrimaryAction={onBoardCardPrimaryAction}
          onCardPointerEnter={onBoardCardPointerEnter}
          onCardPointerLeave={onBoardCardPointerLeave}
          showMight
        />
      </ZoneArea>
      <ZoneArea
        animationZoneId={`${player.playerId}:mainDeck`}
        isCentered
        isHightlighted={isHightlighted}
      >
        <HiddenZone count={player.zones.mainDeck.count} label="Main deck" />
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
  highlightedCardInstanceIds,
  hiddenCardInstanceIds,
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
  const hasBanishment = player.zones.banishment.count > 0;
  const runeCounts = countRuneReadiness(baseRunes);

  return (
    <div
      className={cn(
        "gap-2 grid min-h-0",
        hasBanishment && "grid-cols-[130px_minmax(0,1fr)_130px_64px]",
        !hasBanishment && "grid-cols-[130px_minmax(0,1fr)_130px]",
      )}
    >
      <ZoneArea
        animationZoneId={`${player.playerId}:runeDeck`}
        isCentered
        isHightlighted={isHightlighted}
      >
        <HiddenZone count={player.zones.runeDeck.count} label="Rune deck" />
      </ZoneArea>
      <ZoneArea
        animationZoneId={`${player.playerId}:base`}
        isHightlighted={isHightlighted}
        totalCardsCount={runeCounts}
      >
        <CardList
          cards={baseRunes}
          highlightedCardInstanceIds={highlightedCardInstanceIds}
          hiddenCardInstanceIds={hiddenCardInstanceIds}
          onCardContextAction={onRuneContextAction}
          onCardPrimaryAction={onRunePrimaryAction}
          showMight={false}
        />
      </ZoneArea>
      <ZoneArea
        animationZoneId={`${player.playerId}:trash`}
        isCentered
        isHightlighted={isHightlighted}
      >
        <TrashZone
          highlightedCardInstanceIds={highlightedCardInstanceIds}
          hiddenCardInstanceIds={hiddenCardInstanceIds}
          onClick={onOpenTrash}
          zone={player.zones.trash}
        />
      </ZoneArea>
      {hasBanishment && (
        <ZoneArea
          animationZoneId={`${player.playerId}:banishment`}
          isCentered
          isHightlighted={isHightlighted}
        >
          <Button
            aria-label={`${player.name} banished cards`}
            className="relative p-2"
            onClick={onOpenBanish}
            title={`${player.zones.banishment.count} banished`}
            type="button"
            variant="ghost"
          >
            <ArchiveX className="size-5" />
            <span className="-top-1 -right-1 absolute flex justify-center items-center bg-yellow-300 rounded-full min-w-4 h-4 font-bold text-[10px] text-black">
              {player.zones.banishment.count}
            </span>
          </Button>
        </ZoneArea>
      )}
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
  highlightedCardInstanceIds,
  hiddenCardInstanceIds,
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
}) => {
  if (isMirrored) {
    return (
      <>
        <RunesLine
          highlightedCardInstanceIds={highlightedCardInstanceIds}
          hiddenCardInstanceIds={hiddenCardInstanceIds}
          onOpenBanish={onOpenBanish}
          onOpenTrash={onOpenTrash}
          player={player}
          isHightlighted={isActivePlayer}
        />
        <BaseLine
          highlightedCardInstanceIds={highlightedCardInstanceIds}
          hiddenCardInstanceIds={hiddenCardInstanceIds}
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
        highlightedCardInstanceIds={highlightedCardInstanceIds}
        hiddenCardInstanceIds={hiddenCardInstanceIds}
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
  highlightedCardInstanceIds,
  hiddenCardInstanceIds,
  onCardContextAction,
  onCardPrimaryAction,
  onCardPointerEnter,
  onCardPointerLeave,
  onClick,
  showCount = false,
  showMight = false,
  zone,
}: {
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
  zone: ZoneData;
}) {
  if (zone.cards.length > 0) {
    return (
      <CardList
        cards={zone.cards}
        count={showCount ? zone.count : undefined}
        highlightedCardInstanceIds={highlightedCardInstanceIds}
        hiddenCardInstanceIds={hiddenCardInstanceIds}
        onCardContextAction={onCardContextAction}
        onCardPrimaryAction={onCardPrimaryAction}
        onCardPointerEnter={onCardPointerEnter}
        onCardPointerLeave={onCardPointerLeave}
        onClick={onClick}
        showMight={showMight}
      />
    );
  }

  if (zone.count > 0) {
    return <HiddenZone count={zone.count} label={zone.kind} />;
  }

  return null;
}

function TrashZone({
  highlightedCardInstanceIds,
  hiddenCardInstanceIds,
  onClick,
  zone,
}: {
  highlightedCardInstanceIds?: Set<string>;
  hiddenCardInstanceIds?: Set<string>;
  onClick?: () => void;
  zone: ZoneData;
}) {
  const latestCard = zone.cards.at(-1);

  if (zone.cards.length > 0) {
    return (
      <div className="flex items-center justify-center gap-2 max-w-full">
        {latestCard && (
          <button
            aria-label={`Open trash, ${zone.count} cards`}
            className="relative shrink-0"
            onClick={onClick}
            title={`${zone.count} cards in trash`}
            type="button"
          >
            <CardTile
              enableHoverPreview
              isHighlighted={
                latestCard.instanceId
                  ? highlightedCardInstanceIds?.has(latestCard.instanceId)
                  : false
              }
              isTransferHidden={
                latestCard.instanceId
                  ? hiddenCardInstanceIds?.has(latestCard.instanceId)
                  : false
              }
              showMight={false}
              {...latestCard}
            />
            <span className="top-1 right-1 z-20 absolute bg-yellow-300 px-1.5 py-0.5 rounded font-bold text-black text-xs">
              {zone.count}
            </span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        aria-label="Open trash"
        className="relative flex justify-center items-center p-2 text-slate-100"
        onClick={onClick}
        title={`${zone.count} cards in trash`}
        type="button"
      >
        <Trash2 className="size-5" />
        <span className="-top-1 -right-1 absolute flex justify-center items-center bg-yellow-300 rounded-full min-w-4 h-4 font-bold text-[10px] text-black">
          {zone.count}
        </span>
      </button>
    </div>
  );
}

function CardList({
  cards,
  count,
  highlightedCardInstanceIds,
  hiddenCardInstanceIds,
  onCardContextAction,
  onCardPrimaryAction,
  onCardPointerEnter,
  onCardPointerLeave,
  onClick,
  layout = "row",
  showMight = false,
}: {
  cards: Card[];
  count?: number;
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
  layout?: "row" | "wrap";
  showMight?: boolean;
}) {
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
  }, [cards.length, layout]);

  if (cards.length === 0) {
    return null;
  }

  const content = (
    <>
      {cards.map((card, index) => (
        <CardTile
          enableHoverPreview={!onClick}
          isHighlighted={
            card.instanceId
              ? highlightedCardInstanceIds?.has(card.instanceId)
              : false
          }
          isTransferHidden={
            card.instanceId
              ? hiddenCardInstanceIds?.has(card.instanceId)
              : false
          }
          key={card.instanceId ?? `${card.name}-${index}`}
          onContextAction={
            onCardContextAction
              ? (event) => onCardContextAction(card, event)
              : undefined
          }
          onPrimaryAction={
            onCardPrimaryAction
              ? (event) => onCardPrimaryAction(card, event)
              : undefined
          }
          onHighlightPointerEnter={
            onCardPointerEnter ? () => onCardPointerEnter(card) : undefined
          }
          onHighlightPointerLeave={
            onCardPointerLeave ? () => onCardPointerLeave(card) : undefined
          }
          showMight={showMight}
          {...card}
        />
      ))}
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

function HiddenZone({ count, label }: { count: number; label: string }) {
  return (
    <div className="relative">
      <CardTile img={cardBackImage.src} name={label} />
      <span className="-top-2 left-1/2 z-30 absolute bg-[#111827] shadow-black/50 shadow-md px-1.5 py-0.5 rounded font-bold text-xs -translate-x-1/2">
        {count}
      </span>
    </div>
  );
}
