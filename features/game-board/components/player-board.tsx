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
  player: PlayerData;
};

const BaseLine = ({ player }: { player: PlayerData }) => {
  const baseUnits = player.zones.base.cards.filter((card) => card.type !== "Rune");

  return (
    <div className="gap-2 grid grid-cols-[130px_130px_minmax(0,1fr)_130px]">
      <ZoneArea isCentered>
        <ZoneCards zone={player.zones.champion} emptyLabel="No champion" />
      </ZoneArea>
      <ZoneArea isCentered>
        <ZoneCards zone={player.zones.legend} emptyLabel="No legend" />
      </ZoneArea>
      <ZoneArea>
        <CardList cards={baseUnits} emptyLabel="No base units" />
      </ZoneArea>
      <ZoneArea isCentered>
        <HiddenZone count={player.zones.mainDeck.count} label="Main deck" />
      </ZoneArea>
    </div>
  );
};

const RunesLine = ({
  onOpenBanish,
  player,
}: {
  onOpenBanish?: () => void;
  player: PlayerData;
}) => {
  const baseRunes = player.zones.base.cards.filter((card) => card.type === "Rune");

  return (
    <div className="gap-2 grid grid-cols-[130px_minmax(0,1fr)_130px_64px]">
      <ZoneArea isCentered>
        <HiddenZone count={player.zones.runeDeck.count} label="Rune deck" />
      </ZoneArea>
      <ZoneArea>
        <CardList cards={baseRunes} emptyLabel="No runes" />
        <HandCards zone={player.zones.hand} />
      </ZoneArea>
      <ZoneArea isCentered>
        <ZoneCards zone={player.zones.trash} emptyLabel="Trash" />
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

export const PlayerBoard: FC<Props> = ({ isMirrored, onOpenBanish, player }) => {
  if (isMirrored) {
    return (
      <>
        <RunesLine onOpenBanish={onOpenBanish} player={player} />
        <BaseLine player={player} />
      </>
    );
  }
  return (
    <>
      <BaseLine player={player} />
      <RunesLine onOpenBanish={onOpenBanish} player={player} />
    </>
  );
};

function ZoneCards({
  emptyLabel,
  zone,
}: {
  emptyLabel: string;
  zone: ZoneData;
}) {
  if (zone.cards.length > 0) {
    return <CardList cards={zone.cards} emptyLabel={emptyLabel} />;
  }

  if (zone.count > 0) {
    return <HiddenZone count={zone.count} label={emptyLabel} />;
  }

  return <ZoneEmpty label={emptyLabel} />;
}

function HandCards({ zone }: { zone: ZoneData }) {
  if (zone.cards.length > 0) {
    return <CardList cards={zone.cards} emptyLabel="No hand cards" />;
  }

  if (zone.count === 0) {
    return null;
  }

  return (
    <>
      {Array.from({ length: zone.count }).map((_, index) => (
        <CardTile
          key={`hidden-hand-${index}`}
          img={cardBackImage.src}
          name="Hidden card"
        />
      ))}
    </>
  );
}

function CardList({
  cards,
  emptyLabel,
}: {
  cards: Card[];
  emptyLabel: string;
}) {
  if (cards.length === 0) {
    return <ZoneEmpty label={emptyLabel} />;
  }

  return (
    <>
      {cards.map((card, index) => (
        <CardTile key={card.instanceId ?? `${card.name}-${index}`} {...card} />
      ))}
    </>
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

function ZoneEmpty({ label }: { label: string }) {
  return (
    <span className="px-1 text-center text-[10px] text-slate-500">
      {label}
    </span>
  );
}
