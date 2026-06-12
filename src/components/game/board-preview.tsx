"use client";

import {
  History,
  Layers3,
  PanelRightOpen,
  X
} from "lucide-react";
import { useState, type CSSProperties, type ReactNode } from "react";
import type { Card } from "@/server/catalog";

type TemporaryZone = "chain" | "banish" | "log" | null;

type BoardPreviewProps = {
  annieLegend: Card;
  luxLegend: Card;
  annieChampion: Card;
  luxChampion: Card;
  playerBattlefield: Card;
  opponentBattlefield: Card;
  playerHand: Card[];
  playerRunes: Card[];
  playerUnits: Card[];
  opponentUnits: Card[];
};

export function BoardPreview({
  annieLegend,
  luxLegend,
  annieChampion,
  luxChampion,
  playerBattlefield,
  opponentBattlefield,
  playerHand,
  playerRunes,
  playerUnits,
  opponentUnits
}: BoardPreviewProps) {
  const [openZone, setOpenZone] = useState<TemporaryZone>(null);

  return (
    <main className="h-screen overflow-hidden bg-[#111827] text-slate-100">
      <div className="grid h-full grid-cols-[1fr_56px]">
        <section className="grid min-h-0 grid-rows-[52px_1fr]">
          <ScoreHeader playerScore={0} opponentScore={1} />

          <section className="grid min-h-0 grid-rows-[1fr_1.08fr_1.12fr] gap-2 p-2">
            <OpponentArea
              champion={luxChampion}
              handCount={3}
              legend={luxLegend}
              mainDeckCount={32}
              runeCountLabel="0/5"
              runeDeckCount={7}
            />

            <BattlefieldArea
              opponentBattlefield={opponentBattlefield}
              opponentUnits={opponentUnits}
              playerBattlefield={playerBattlefield}
              playerUnits={playerUnits}
            />

            <PlayerArea
              champion={annieChampion}
              hand={playerHand}
              legend={annieLegend}
              mainDeckCount={32}
              runes={playerRunes}
              runeCountLabel="2/5"
              runeDeckCount={7}
            />
          </section>
        </section>

        <ActionRail openZone={openZone} setOpenZone={setOpenZone} />
      </div>

      <TemporaryZoneOverlay openZone={openZone} onClose={() => setOpenZone(null)} />
    </main>
  );
}

function ScoreHeader({
  playerScore,
  opponentScore
}: {
  playerScore: number;
  opponentScore: number;
}) {
  return (
    <header className="grid grid-cols-[160px_1fr_160px] items-center bg-[#3f3f3f] px-4">
      <div className="text-sm font-semibold">Player 1</div>
      <div className="flex justify-center">
        <ScoreTrack playerScore={playerScore} opponentScore={opponentScore} />
      </div>
      <div className="text-right text-sm font-semibold">Player 2</div>
    </header>
  );
}

function OpponentArea({
  champion,
  handCount,
  legend,
  mainDeckCount,
  runeCountLabel,
  runeDeckCount
}: {
  champion: Card;
  handCount: number;
  legend: Card;
  mainDeckCount: number;
  runeCountLabel: string;
  runeDeckCount: number;
}) {
  return (
    <section className="grid min-h-0 grid-rows-2 gap-2">
      <div className="grid min-h-0 grid-cols-[130px_1fr_130px] gap-2">
        <DeckSlot count={runeDeckCount} title="Opponent Rune Deck" />
        <BoardSlot title={`Opponent Runes ${runeCountLabel}`}>
          <HiddenHandAndRunes handCount={handCount} />
        </BoardSlot>
        <BoardSlot title="Opponent Trash">
          <ZoneCount value={0} />
        </BoardSlot>
      </div>

      <div className="grid min-h-0 grid-cols-[130px_130px_1fr_130px] gap-2">
        <BoardSlot title="Opponent Champion">
          <CardImage card={champion} className="w-20 rotate-180" />
        </BoardSlot>
        <BoardSlot title="Opponent Legend">
          <CardImage card={legend} className="w-20 rotate-180" />
        </BoardSlot>
        <BoardSlot title="Opponent Base">
          <EmptyState label="No base objects in preview state" />
        </BoardSlot>
        <DeckSlot count={mainDeckCount} title="Opponent Main Deck" />
      </div>
    </section>
  );
}

function BattlefieldArea({
  opponentBattlefield,
  opponentUnits,
  playerBattlefield,
  playerUnits
}: {
  opponentBattlefield: Card;
  opponentUnits: Card[];
  playerBattlefield: Card;
  playerUnits: Card[];
}) {
  return (
    <section className="grid min-h-0 grid-cols-2 gap-2">
      <BoardSlot title="Player 1 Battlefield">
        <BattlefieldContent battlefield={playerBattlefield} units={playerUnits} />
      </BoardSlot>
      <BoardSlot title="Player 2 Battlefield">
        <BattlefieldContent
          battlefield={opponentBattlefield}
          mirrored
          units={opponentUnits}
        />
      </BoardSlot>
    </section>
  );
}

function PlayerArea({
  champion,
  hand,
  legend,
  mainDeckCount,
  runes,
  runeCountLabel,
  runeDeckCount
}: {
  champion: Card;
  hand: Card[];
  legend: Card;
  mainDeckCount: number;
  runes: Card[];
  runeCountLabel: string;
  runeDeckCount: number;
}) {
  return (
    <section className="grid min-h-0 grid-rows-[0.86fr_1fr] gap-2">
      <div className="grid min-h-0 grid-cols-[130px_130px_1fr_130px] gap-2">
        <BoardSlot title="Champion">
          <CardImage card={champion} className="w-20" />
        </BoardSlot>
        <BoardSlot title="Legend">
          <CardImage card={legend} className="w-20" />
        </BoardSlot>
        <BoardSlot title="Base">
          <EmptyState label="No base objects in preview state" />
        </BoardSlot>
        <DeckSlot count={mainDeckCount} title="Main Deck" />
      </div>

      <div className="grid min-h-0 grid-cols-[130px_1fr_130px] gap-2">
        <DeckSlot count={runeDeckCount} title="Rune Deck" />
        <BoardSlot title={`Runes and Hand ${runeCountLabel}`}>
          <RuneAndHandZone hand={hand} runes={runes} />
        </BoardSlot>
        <BoardSlot title="Trash">
          <ZoneCount value={0} />
        </BoardSlot>
      </div>
    </section>
  );
}

function BattlefieldContent({
  battlefield,
  mirrored = false,
  units
}: {
  battlefield: Card;
  mirrored?: boolean;
  units: Card[];
}) {
  return (
    <div className="grid h-full grid-cols-[96px_1fr] items-center gap-3">
      <CardImage card={battlefield} className={`w-20 ${mirrored ? "rotate-180" : ""}`} />
      <UnitRow cards={units} mirrored={mirrored} />
    </div>
  );
}

function HiddenHandAndRunes({ handCount }: { handCount: number }) {
  return (
    <div className="relative h-full overflow-hidden">
      <div className="absolute inset-x-0 top-2 flex justify-center">
        <div className="text-xs font-semibold text-slate-300">Hand: {handCount} hidden</div>
      </div>
      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2">
        {Array.from({ length: handCount }).map((_, index) => (
          <CardBack key={index} className="w-16 rotate-180" />
        ))}
      </div>
    </div>
  );
}

function RuneAndHandZone({ hand, runes }: { hand: Card[]; runes: Card[] }) {
  return (
    <div className="relative h-full min-h-40 overflow-visible">
      <div className="absolute bottom-2 left-4 flex gap-2">
        {runes.map((rune, index) => (
          <CardImage key={`${rune.name}-${index}`} card={rune} className="w-20" />
        ))}
      </div>

      <div className="absolute bottom-8 left-[58%] flex -translate-x-1/2 items-end gap-1">
        {hand.map((card, index) => (
          <CardImage
            key={`${card.name}-${index}`}
            card={card}
            className="w-24 origin-bottom rotate-[var(--hand-rotate)] transition-transform duration-150 hover:z-20 hover:scale-125 hover:-translate-y-12"
            style={handStyle(index, hand.length)}
          />
        ))}
      </div>
    </div>
  );
}

function ActionRail({
  openZone,
  setOpenZone
}: {
  openZone: TemporaryZone;
  setOpenZone: (zone: TemporaryZone) => void;
}) {
  return (
    <aside className="relative flex h-full flex-col items-center justify-center gap-3 bg-[#111827]">
      <ActionButton
        active={openZone === "chain"}
        label="Chain"
        onClick={() => setOpenZone(openZone === "chain" ? null : "chain")}
      >
        <Layers3 className="size-5" />
      </ActionButton>
      <ActionButton
        active={openZone === "banish"}
        label="Banish"
        onClick={() => setOpenZone(openZone === "banish" ? null : "banish")}
      >
        <PanelRightOpen className="size-5" />
      </ActionButton>
      <ActionButton
        active={openZone === "log"}
        label="Game Log"
        onClick={() => setOpenZone(openZone === "log" ? null : "log")}
      >
        <History className="size-5" />
      </ActionButton>
    </aside>
  );
}

function TemporaryZoneOverlay({
  openZone,
  onClose
}: {
  openZone: TemporaryZone;
  onClose: () => void;
}) {
  if (!openZone) {
    return null;
  }

  const title =
    openZone === "chain" ? "Chain" : openZone === "banish" ? "Banished Cards" : "Game Log";
  const message =
    openZone === "chain"
      ? "The chain is empty in the current preview state."
      : openZone === "banish"
        ? ""
        : "No accepted server events are present in the current preview state.";

  return (
    <div className="absolute right-16 top-20 z-30 w-72 rounded-lg border border-white/10 bg-[#111827]/95 p-3 shadow-2xl shadow-black/50">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold">{title}</div>
        <button
          aria-label="Close temporary zone"
          className="rounded bg-slate-700 p-1 text-slate-100 hover:bg-slate-600"
          onClick={onClose}
          type="button"
        >
          <X className="size-4" />
        </button>
      </div>
      {openZone === "banish" ? (
        <div className="grid gap-2">
          <BoardSlot title="Player 1 Banish">
            <EmptyState label="No banished cards in preview state" />
          </BoardSlot>
          <BoardSlot title="Player 2 Banish">
            <EmptyState label="No banished cards in preview state" />
          </BoardSlot>
        </div>
      ) : (
        <EmptyState label={message} />
      )}
    </div>
  );
}

function BoardSlot({
  children,
  className = "",
  title
}: {
  children: ReactNode;
  className?: string;
  title: string;
}) {
  return (
    <div className={`min-h-0 rounded-md bg-[#2f3a4d] p-2 ${className}`}>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-300">
        {title}
      </div>
      <div className="h-[calc(100%-20px)]">{children}</div>
    </div>
  );
}

function DeckSlot({ count, title }: { count: number; title: string }) {
  return (
    <BoardSlot title={title}>
      <div className="flex h-full items-center justify-center">
        <div className="relative">
          <CardBack className="w-20" />
          <CountBadge value={count} />
        </div>
      </div>
    </BoardSlot>
  );
}

function UnitRow({ cards, mirrored = false }: { cards: Card[]; mirrored?: boolean }) {
  if (cards.length === 0) {
    return <EmptyState label="No units here" />;
  }

  return (
    <div className="flex h-full items-center justify-center gap-2">
      {cards.map((card, index) => (
        <CardImage
          key={`${card.name}-${index}`}
          card={card}
          className={`w-20 ${mirrored ? "-rotate-90" : "rotate-90"}`}
        />
      ))}
    </div>
  );
}

function ZoneCount({ value }: { value: number }) {
  return (
    <div className="flex h-full items-center justify-center text-4xl font-bold">
      {value}
    </div>
  );
}

function ScoreTrack({
  opponentScore,
  playerScore
}: {
  opponentScore: number;
  playerScore: number;
}) {
  const values = [0, 1, 2, 3, 4, 5, 6, 7, 8, 7, 6, 5, 4, 3, 2, 1, 0];

  return (
    <div className="flex items-center gap-1">
      {values.map((value, index) => {
        const active =
          (index <= 8 && value === playerScore) ||
          (index >= 8 && value === opponentScore);

        return (
          <div
            key={`${value}-${index}`}
            className={`flex size-7 items-center justify-center rounded-md border-2 text-sm font-bold ${
              active
                ? "border-yellow-300 bg-white text-slate-950"
                : "border-black bg-slate-100 text-slate-950"
            } ${value === 8 ? "size-10 text-lg" : ""}`}
          >
            {value}
          </div>
        );
      })}
    </div>
  );
}

function ActionButton({
  active,
  children,
  label,
  onClick
}: {
  active: boolean;
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className={`flex size-10 items-center justify-center rounded-md transition ${
        active ? "bg-cyan-500 text-white" : "bg-[#263142] text-slate-100 hover:bg-[#33445a]"
      }`}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-16 items-center justify-center rounded border border-dashed border-white/15 px-3 text-center text-xs text-slate-400">
      {label}
    </div>
  );
}

function CardBack({ className = "" }: { className?: string }) {
  return (
    <div
      className={`aspect-[744/1039] rounded-md border border-cyan-300/50 bg-[#15586b] shadow shadow-black/30 ${className}`}
    >
      <div className="flex h-full items-center justify-center p-2 text-center text-[10px] font-bold uppercase tracking-wide text-cyan-100">
        League of Legends
      </div>
    </div>
  );
}

function CountBadge({ value }: { value: number }) {
  return (
    <div className="absolute -top-2 left-1/2 -translate-x-1/2 rounded bg-[#111827] px-2 py-0.5 text-base font-bold">
      {value}
    </div>
  );
}

function CardImage({
  card,
  className,
  style
}: {
  card: Card;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- MVP intentionally renders set media.image_url directly.
    <img
      alt={card.media.accessibility_text ?? card.name}
      className={`rounded-md border border-black/60 shadow shadow-black/40 ${className ?? ""}`}
      src={card.media.image_url ?? ""}
      style={style}
    />
  );
}

function handStyle(index: number, total: number): CSSProperties {
  const middle = (total - 1) / 2;
  const offset = index - middle;
  const rotate = Math.max(-10, Math.min(10, offset * 5));

  return {
    "--hand-rotate": `${rotate}deg`
  } as CSSProperties;
}
