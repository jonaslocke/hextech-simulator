import { FC } from "react";
import cardBackImage from "../../../assets/cardback.jpg";
import { CardTile } from "./card-tile";
import { ZoneArea } from "./zone-area";
import { ArchiveX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, PlayerData, ZoneData } from "../types";

type Props = {
  isMirrored?: boolean;
  onOpenBanish?: () => void;
  onOpenTrash?: () => void;
  player: PlayerData;
};

const BaseLine = ({ player }: { player: PlayerData }) => {
  const baseUnits = player.zones.base.cards.filter((card) => card.type !== "Rune");

  return (
    <div className="gap-2 grid grid-cols-[130px_130px_minmax(0,1fr)_130px]">
      <ZoneArea isCentered>
        <ZoneCards zone={player.zones.champion} />
      </ZoneArea>
      <ZoneArea isCentered>
        <ZoneCards zone={player.zones.legend} />
      </ZoneArea>
      <ZoneArea>
        <CardList cards={baseUnits} />
      </ZoneArea>
      <ZoneArea isCentered>
        <HiddenZone count={player.zones.mainDeck.count} label="Main deck" />
      </ZoneArea>
    </div>
  );
};

const RunesLine = ({
  onOpenBanish,
  onOpenTrash,
  player,
}: {
  onOpenBanish?: () => void;
  onOpenTrash?: () => void;
  player: PlayerData;
}) => {
  const baseRunes = player.zones.base.cards.filter((card) => card.type === "Rune");

  return (
    <div className="gap-2 grid grid-cols-[130px_minmax(0,1fr)_130px_64px]">
      <ZoneArea isCentered>
        <HiddenZone count={player.zones.runeDeck.count} label="Rune deck" />
      </ZoneArea>
      <ZoneArea>
        <CardList cards={baseRunes} />
      </ZoneArea>
      <ZoneArea isCentered>
        <ZoneCards onClick={onOpenTrash} showCount zone={player.zones.trash} />
      </ZoneArea>
      <ZoneArea isCentered>
        <Button
          aria-label={`${player.name} banished cards`}
          className="relative p-2"
          onClick={onOpenBanish}
          title={`${player.zones.banishment.count} banished`}
          type="button"
          variant="ghost"
        >
          <ArchiveX className="size-5" />
          {player.zones.banishment.count > 0 && (
            <span className="-top-1 -right-1 absolute flex justify-center items-center bg-yellow-300 rounded-full min-w-4 h-4 font-bold text-[10px] text-black">
              {player.zones.banishment.count}
            </span>
          )}
        </Button>
      </ZoneArea>
    </div>
  );
};

export const PlayerBoard: FC<Props> = ({
  isMirrored,
  onOpenBanish,
  onOpenTrash,
  player,
}) => {
  if (isMirrored) {
    return (
      <>
        <RunesLine
          onOpenBanish={onOpenBanish}
          onOpenTrash={onOpenTrash}
          player={player}
        />
        <BaseLine player={player} />
      </>
    );
  }
  return (
    <>
      <BaseLine player={player} />
      <RunesLine
        onOpenBanish={onOpenBanish}
        onOpenTrash={onOpenTrash}
        player={player}
      />
    </>
  );
};

function ZoneCards({
  onClick,
  showCount = false,
  zone,
}: {
  onClick?: () => void;
  showCount?: boolean;
  zone: ZoneData;
}) {
  if (zone.cards.length > 0) {
    return (
      <CardList
        cards={zone.cards}
        count={showCount ? zone.count : undefined}
        onClick={onClick}
      />
    );
  }

  if (zone.count > 0) {
    return <HiddenZone count={zone.count} label={zone.kind} />;
  }

  return null;
}

function CardList({
  cards,
  count,
  onClick,
}: {
  cards: Card[];
  count?: number;
  onClick?: () => void;
}) {
  if (cards.length === 0) {
    return null;
  }

  const content = (
    <>
      {cards.map((card, index) => (
        <CardTile key={card.instanceId ?? `${card.name}-${index}`} {...card} />
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
    return <div className="relative flex">{content}</div>;
  }

  return (
    <button
      aria-label={`Open ${cards[0]?.name ?? "zone"}`}
      className="relative flex"
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
      <span className="-top-2 left-1/2 absolute bg-[#111827] px-1.5 py-0.5 rounded font-bold text-xs -translate-x-1/2">
        {count}
      </span>
    </div>
  );
}
