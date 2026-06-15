import { ComponentProps, FC, MouseEvent } from "react";
import cardBackImage from "../../../assets/cardback.jpg";
import { cn } from "@/lib/utils";
import { CardTile } from "./card-tile";
import { ZoneArea } from "./zone-area";
import { ArchiveX, Hand, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, PlayerData, ZoneData } from "../types";

type BaseLineProps = {
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
      <ZoneArea isCentered isHightlighted={isHightlighted}>
        <ZoneCards
          onCardContextAction={onChampionContextAction}
          onCardPrimaryAction={onChampionPrimaryAction}
          zone={player.zones.champion}
        />
      </ZoneArea>
      <ZoneArea isCentered isHightlighted={isHightlighted}>
        <ZoneCards zone={player.zones.legend} />
      </ZoneArea>
      <ZoneArea isHightlighted={isHightlighted}>
        <CardList cards={baseUnits} />
      </ZoneArea>
      <ZoneArea isCentered isHightlighted={isHightlighted}>
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
      <ZoneArea isCentered isHightlighted={isHightlighted}>
        <HiddenZone count={player.zones.runeDeck.count} label="Rune deck" />
      </ZoneArea>
      <ZoneArea isHightlighted={isHightlighted}>
        <CardList
          cards={baseRunes}
          onCardContextAction={onRuneContextAction}
          onCardPrimaryAction={onRunePrimaryAction}
        />
      </ZoneArea>
      <ZoneArea isCentered isHightlighted={isHightlighted}>
        <TrashZone
          handCount={isMirrored ? player.zones.hand.count : undefined}
          onClick={onOpenTrash}
          zone={player.zones.trash}
        />
      </ZoneArea>
      {hasBanishment && (
        <ZoneArea isCentered isHightlighted={isHightlighted}>
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
          isMirrored
          onOpenBanish={onOpenBanish}
          onOpenTrash={onOpenTrash}
          player={player}
          isHightlighted={isActivePlayer}
        />
        <BaseLine player={player} isHightlighted={isActivePlayer} />
      </>
    );
  }
  return (
    <>
      <BaseLine
        onChampionContextAction={onChampionContextAction}
        onChampionPrimaryAction={onChampionPrimaryAction}
        player={player}
        isHightlighted={isActivePlayer}
      />
      <RunesLine
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
  onCardContextAction,
  onCardPrimaryAction,
  onClick,
  showCount = false,
  zone,
}: {
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
  handCount,
  onClick,
  zone,
}: {
  handCount?: number;
  onClick?: () => void;
  zone: ZoneData;
}) {
  if (zone.cards.length > 0) {
    return (
      <div className="flex items-center gap-2">
        <ZoneCards onClick={onClick} showCount zone={zone} />
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
  onCardContextAction,
  onCardPrimaryAction,
  onClick,
}: {
  cards: Card[];
  count?: number;
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
      <span className="-top-2 left-1/2 z-30 absolute bg-[#111827] px-1.5 py-0.5 rounded font-bold text-xs shadow-md shadow-black/50 -translate-x-1/2">
        {count}
      </span>
    </div>
  );
}
