import { ComponentProps, FC, MouseEvent } from "react";
import cardBackImage from "../../../../assets/cardback.jpg";
import { cn } from "@/shared/utils/cn";
import { CardTile } from "./card-tile";
import { ZoneArea } from "./zone-area";
import { ArchiveX, Hand, Trash2 } from "lucide-react";
import { Button } from "@/shared/components/button";
import { Card, PlayerData, ZoneData } from "../types";

type BaseLineProps = {
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
};

type Props = {
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
  onRuneContextAction?: (card: Card, event: MouseEvent<HTMLDivElement>) => void;
  onRunePrimaryAction?: (card: Card) => void;
  onOpenBanish?: () => void;
  onOpenTrash?: () => void;
  player: PlayerData;
  isActivePlayer: boolean;
};

const BaseLine = ({
  hiddenCardInstanceIds,
  player,
  isHightlighted,
  onChampionContextAction,
  onChampionPrimaryAction,
}: BaseLineProps) => {
  const baseUnits = player.zones.base.cards.filter(
    (card) => card.type !== "Rune",
  );

  return (
    <div className="gap-2 grid grid-cols-[130px_130px_minmax(0,1fr)_130px]">
      <ZoneArea
        animationZoneId={`${player.playerId}:champion`}
        isCentered
        isHightlighted={isHightlighted}
      >
        <ZoneCards
          hiddenCardInstanceIds={hiddenCardInstanceIds}
          onCardContextAction={onChampionContextAction}
          onCardPrimaryAction={onChampionPrimaryAction}
          zone={player.zones.champion}
        />
      </ZoneArea>
      <ZoneArea
        animationZoneId={`${player.playerId}:legend`}
        isCentered
        isHightlighted={isHightlighted}
      >
        <ZoneCards
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
          hiddenCardInstanceIds={hiddenCardInstanceIds}
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
  isMirrored?: boolean;
  onRuneContextAction?: (card: Card, event: MouseEvent<HTMLDivElement>) => void;
  onRunePrimaryAction?: (card: Card) => void;
  onOpenBanish?: () => void;
  onOpenTrash?: () => void;
}

const RunesLine = ({
  hiddenCardInstanceIds,
  isMirrored = false,
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

  return (
    <div
      className={cn(
        "gap-2 grid",
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
        // TODO: wire this to current exhausted / ready rune from the real game projection
        totalCardsCount={{
          exhausted: 1,
          ready: 10,
        }}
      >
        <CardList
          cards={baseRunes}
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
        <TrashZone
          hiddenCardInstanceIds={hiddenCardInstanceIds}
          handCount={isMirrored ? player.zones.hand.count : undefined}
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

export const PlayerBoard: FC<Props> = ({
  hiddenCardInstanceIds,
  isMirrored,
  onChampionContextAction,
  onChampionPrimaryAction,
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
          hiddenCardInstanceIds={hiddenCardInstanceIds}
          isMirrored
          onOpenBanish={onOpenBanish}
          onOpenTrash={onOpenTrash}
          player={player}
          isHightlighted={isActivePlayer}
        />
        <BaseLine
          hiddenCardInstanceIds={hiddenCardInstanceIds}
          player={player}
          isHightlighted={isActivePlayer}
        />
      </>
    );
  }
  return (
    <>
      <BaseLine
        hiddenCardInstanceIds={hiddenCardInstanceIds}
        onChampionContextAction={onChampionContextAction}
        onChampionPrimaryAction={onChampionPrimaryAction}
        player={player}
        isHightlighted={isActivePlayer}
      />
      <RunesLine
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
  hiddenCardInstanceIds,
  onCardContextAction,
  onCardPrimaryAction,
  onClick,
  showCount = false,
  zone,
}: {
  hiddenCardInstanceIds?: Set<string>;
  onCardContextAction?: (card: Card, event: MouseEvent<HTMLDivElement>) => void;
  onCardPrimaryAction?: (
    card: Card,
    event?: MouseEvent<HTMLDivElement>,
  ) => void;
  onClick?: () => void;
  showCount?: boolean;
  zone: ZoneData;
}) {
  if (zone.cards.length > 0) {
    return (
      <CardList
        cards={zone.cards}
        count={showCount ? zone.count : undefined}
        hiddenCardInstanceIds={hiddenCardInstanceIds}
        onCardContextAction={onCardContextAction}
        onCardPrimaryAction={onCardPrimaryAction}
        onClick={onClick}
      />
    );
  }

  if (zone.count > 0) {
    return <HiddenZone count={zone.count} label={zone.kind} />;
  }

  return null;
}

function TrashZone({
  hiddenCardInstanceIds,
  handCount,
  onClick,
  zone,
}: {
  hiddenCardInstanceIds?: Set<string>;
  handCount?: number;
  onClick?: () => void;
  zone: ZoneData;
}) {
  if (zone.cards.length > 0) {
    return (
      <div className="flex items-center gap-2">
        <ZoneCards
          hiddenCardInstanceIds={hiddenCardInstanceIds}
          onClick={onClick}
          showCount
          zone={zone}
        />
        {handCount !== undefined && <HandCount value={handCount} />}
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
      {handCount !== undefined && <HandCount value={handCount} />}
    </div>
  );
}

function HandCount({ value }: { value: number }) {
  return (
    <div
      aria-label={`${value} cards in hand`}
      className="relative flex justify-center items-center p-2 text-slate-100"
      title={`${value} cards in hand`}
    >
      <Hand className="size-5" />
      <span className="-top-1 -right-1 absolute flex justify-center items-center bg-yellow-300 rounded-full min-w-4 h-4 font-bold text-[10px] text-black">
        {value}
      </span>
    </div>
  );
}

function CardList({
  cards,
  count,
  hiddenCardInstanceIds,
  onCardContextAction,
  onCardPrimaryAction,
  onClick,
}: {
  cards: Card[];
  count?: number;
  hiddenCardInstanceIds?: Set<string>;
  onCardContextAction?: (card: Card, event: MouseEvent<HTMLDivElement>) => void;
  onCardPrimaryAction?: (
    card: Card,
    event?: MouseEvent<HTMLDivElement>,
  ) => void;
  onClick?: () => void;
}) {
  if (cards.length === 0) {
    return null;
  }

  const content = (
    <>
      {cards.map((card, index) => (
        <CardTile
          enableHoverPreview={!onClick}
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

  if (!onClick && count === undefined) {
    return content;
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
