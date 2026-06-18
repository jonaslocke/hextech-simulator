"use client";

import { History, Layers3, PanelRightOpen, X } from "lucide-react";
import { useState, type CSSProperties, type ReactNode } from "react";
import cardBackImage from "../../../../assets/cardback.jpg";
import type { Card } from "@/server/catalog";
import type { GameLogEntry } from "@/server/events";
import type { GameProjection, ProjectedZone } from "@/server/match";

type TemporaryZone = "chain" | "banish" | "log" | null;

type BoardPreviewProps = {
  cardsByInstanceId: Record<string, Card>;
  logEntries: GameLogEntry[];
  projection: GameProjection;
};

export function BoardPreview({
  cardsByInstanceId,
  logEntries,
  projection
}: BoardPreviewProps) {
  const [openZone, setOpenZone] = useState<TemporaryZone>(null);
  const viewerPlayerId = projection.viewerPlayerId;
  const opponentPlayerId = projection.setup.playerIds.find(
    (playerId) => playerId !== viewerPlayerId
  )!;
  const player = projection.players[viewerPlayerId]!;
  const opponent = projection.players[opponentPlayerId]!;
  const playerBattlefield = projection.battlefields.find(
    (battlefield) => battlefield.selectedByPlayerId === viewerPlayerId
  );
  const opponentBattlefield = projection.battlefields.find(
    (battlefield) => battlefield.selectedByPlayerId === opponentPlayerId
  );

  return (
    <main className="h-screen overflow-hidden bg-[#111827] text-slate-100">
      <div className="grid h-full grid-cols-[1fr_56px]">
        <section className="grid min-h-0 grid-rows-[52px_1fr]">
          <ScoreHeader playerScore={0} opponentScore={0} />

          <section className="grid min-h-0 grid-rows-[1fr_1.08fr_1.12fr] gap-2 p-2">
            <OpponentArea
              cardsByInstanceId={cardsByInstanceId}
              player={opponent}
            />

            <BattlefieldArea
              cardsByInstanceId={cardsByInstanceId}
              opponentBattlefield={opponentBattlefield}
              playerBattlefield={playerBattlefield}
            />

            <PlayerArea cardsByInstanceId={cardsByInstanceId} player={player} />
          </section>
        </section>

        <ActionRail openZone={openZone} setOpenZone={setOpenZone} />
      </div>

      <StatusPrompt projection={projection} />
      <TemporaryZoneOverlay
        cardsByInstanceId={cardsByInstanceId}
        logEntries={logEntries}
        onClose={() => setOpenZone(null)}
        openZone={openZone}
        playerBanishment={player.zones.banishment}
        opponentBanishment={opponent.zones.banishment}
      />
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
  cardsByInstanceId,
  player
}: {
  cardsByInstanceId: Record<string, Card>;
  player: GameProjection["players"][string];
}) {
  const baseRunes = zoneCards(player.zones.base, cardsByInstanceId).filter(
    (card) => card.classification.type === "Rune"
  );
  const baseObjects = zoneCards(player.zones.base, cardsByInstanceId).filter(
    (card) => card.classification.type !== "Rune"
  );

  return (
    <section className="grid min-h-0 grid-rows-2 gap-2">
      <div className="grid min-h-0 grid-cols-[130px_1fr_130px] gap-2">
        <DeckSlot count={player.zones.runeDeck.count} title="Rune Deck" />
        <BoardSlot title="Runes">
          <HiddenHandAndRunes handCount={player.zones.hand.count} runes={baseRunes} />
        </BoardSlot>
        <BoardSlot title="Trash">
          <ZoneCards cards={zoneCards(player.zones.trash, cardsByInstanceId)} mirrored />
        </BoardSlot>
      </div>

      <div className="grid min-h-0 grid-cols-[130px_130px_1fr_130px] gap-2">
        <BoardSlot title="Champion">
          <ZoneCards cards={zoneCards(player.zones.champion, cardsByInstanceId)} mirrored />
        </BoardSlot>
        <BoardSlot title="Legend">
          <ZoneCards cards={zoneCards(player.zones.legend, cardsByInstanceId)} mirrored />
        </BoardSlot>
        <BoardSlot title="Base">
          <UnitRow cards={baseObjects} mirrored />
        </BoardSlot>
        <DeckSlot count={player.zones.mainDeck.count} title="Main Deck" />
      </div>
    </section>
  );
}

function BattlefieldArea({
  cardsByInstanceId,
  opponentBattlefield,
  playerBattlefield
}: {
  cardsByInstanceId: Record<string, Card>;
  opponentBattlefield: GameProjection["battlefields"][number] | undefined;
  playerBattlefield: GameProjection["battlefields"][number] | undefined;
}) {
  return (
    <section className="grid min-h-0 grid-cols-2 gap-2">
      <BoardSlot title="Battlefield">
        <BattlefieldContent
          battlefield={playerBattlefield}
          cardsByInstanceId={cardsByInstanceId}
        />
      </BoardSlot>
      <BoardSlot title="Battlefield">
        <BattlefieldContent
          battlefield={opponentBattlefield}
          cardsByInstanceId={cardsByInstanceId}
          mirrored
        />
      </BoardSlot>
    </section>
  );
}

function PlayerArea({
  cardsByInstanceId,
  player
}: {
  cardsByInstanceId: Record<string, Card>;
  player: GameProjection["players"][string];
}) {
  const baseCards = zoneCards(player.zones.base, cardsByInstanceId);
  const baseRunes = baseCards.filter((card) => card.classification.type === "Rune");
  const baseObjects = baseCards.filter((card) => card.classification.type !== "Rune");

  return (
    <section className="grid min-h-0 grid-rows-[0.86fr_1fr] gap-2">
      <div className="grid min-h-0 grid-cols-[130px_130px_1fr_130px] gap-2">
        <BoardSlot title="Champion">
          <ZoneCards cards={zoneCards(player.zones.champion, cardsByInstanceId)} />
        </BoardSlot>
        <BoardSlot title="Legend">
          <ZoneCards cards={zoneCards(player.zones.legend, cardsByInstanceId)} />
        </BoardSlot>
        <BoardSlot title="Base">
          <UnitRow cards={baseObjects} />
        </BoardSlot>
        <DeckSlot count={player.zones.mainDeck.count} title="Main Deck" />
      </div>

      <div className="grid min-h-0 grid-cols-[130px_1fr_130px] gap-2">
        <DeckSlot count={player.zones.runeDeck.count} title="Rune Deck" />
        <BoardSlot title="Runes and Hand">
          <RuneAndHandZone
            hand={zoneCards(player.zones.hand, cardsByInstanceId)}
            handCount={player.zones.hand.count}
            runes={baseRunes}
          />
        </BoardSlot>
        <BoardSlot title="Trash">
          <ZoneCards cards={zoneCards(player.zones.trash, cardsByInstanceId)} />
        </BoardSlot>
      </div>
    </section>
  );
}

function BattlefieldContent({
  battlefield,
  cardsByInstanceId,
  mirrored = false
}: {
  battlefield: GameProjection["battlefields"][number] | undefined;
  cardsByInstanceId: Record<string, Card>;
  mirrored?: boolean;
}) {
  if (!battlefield) {
    return <EmptyState label="No battlefield selected" />;
  }

  return (
    <div className="grid h-full grid-cols-[96px_1fr] items-center gap-3">
      <CardFromId
        cardInstanceId={battlefield.cardInstanceId}
        cardsByInstanceId={cardsByInstanceId}
        className={`w-20 ${mirrored ? "rotate-180" : ""}`}
      />
      <UnitRow
        cards={battlefield.units.flatMap((cardInstanceId) =>
          cardFromId(cardInstanceId, cardsByInstanceId)
        )}
        mirrored={mirrored}
      />
    </div>
  );
}

function HiddenHandAndRunes({ handCount, runes }: { handCount: number; runes: Card[] }) {
  return (
    <div className="relative h-full overflow-hidden">
      <div className="absolute inset-x-0 top-2 flex justify-center">
        <div className="text-xs font-semibold text-slate-300">Hand: {handCount} hidden</div>
      </div>
      <div className="absolute bottom-3 left-4 flex gap-2">
        {runes.map((rune, index) => (
          <CardImage
            key={`${rune.name}-${index}`}
            card={rune}
            className="w-16 rotate-180"
          />
        ))}
      </div>
      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2">
        {Array.from({ length: handCount }).map((_, index) => (
          <CardBack key={index} className="w-16 rotate-180" />
        ))}
      </div>
    </div>
  );
}

function RuneAndHandZone({
  hand,
  handCount,
  runes
}: {
  hand: Card[];
  handCount: number;
  runes: Card[];
}) {
  return (
    <div className="relative h-full min-h-40 overflow-visible">
      <div className="absolute bottom-2 left-4 flex gap-2">
        {runes.map((rune, index) => (
          <CardImage key={`${rune.name}-${index}`} card={rune} className="w-20" />
        ))}
      </div>

      <div className="absolute bottom-8 left-[58%] flex -translate-x-1/2 items-end gap-1">
        {hand.length > 0
          ? hand.map((card, index) => (
              <CardImage
                key={`${card.name}-${index}`}
                card={card}
                className="w-24 origin-bottom rotate-[var(--hand-rotate)] transition-transform duration-150 hover:z-20 hover:scale-125 hover:-translate-y-12"
                style={handStyle(index, hand.length)}
              />
            ))
          : Array.from({ length: handCount }).map((_, index) => (
              <CardBack
                key={index}
                className="w-20 origin-bottom rotate-[var(--hand-rotate)]"
                style={handStyle(index, handCount)}
              />
            ))}
      </div>
    </div>
  );
}

function StatusPrompt({ projection }: { projection: GameProjection }) {
  const turn = projection.turn;
  const showdown = projection.showdown;
  const text = showdown
    ? `Showdown: focus ${showdown.focusPlayerId}, priority ${showdown.priorityPlayerId}`
    : turn
      ? `Turn ${turn.turnNumber}: ${turn.phase}, active ${turn.activePlayerId}`
      : "Waiting for server-authoritative setup state";

  return (
    <div className="absolute left-4 top-16 rounded-md border border-white/10 bg-[#172033]/95 px-3 py-2 text-xs text-slate-200 shadow-lg shadow-black/30">
      {text}
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
  cardsByInstanceId,
  logEntries,
  onClose,
  openZone,
  opponentBanishment,
  playerBanishment
}: {
  cardsByInstanceId: Record<string, Card>;
  logEntries: GameLogEntry[];
  onClose: () => void;
  openZone: TemporaryZone;
  opponentBanishment: ProjectedZone;
  playerBanishment: ProjectedZone;
}) {
  if (!openZone) {
    return null;
  }

  const title =
    openZone === "chain" ? "Chain" : openZone === "banish" ? "Banished Cards" : "Game Log";

  return (
    <div className="absolute right-16 top-20 z-30 w-80 rounded-lg border border-white/10 bg-[#111827]/95 p-3 shadow-2xl shadow-black/50">
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
          <BoardSlot title="Player Banish">
            <ZoneCards cards={zoneCards(playerBanishment, cardsByInstanceId)} />
          </BoardSlot>
          <BoardSlot title="Opponent Banish">
            <ZoneCards cards={zoneCards(opponentBanishment, cardsByInstanceId)} mirrored />
          </BoardSlot>
        </div>
      ) : openZone === "log" ? (
        <LogList entries={logEntries} />
      ) : (
        <EmptyState label="The chain is empty in the current projected state" />
      )}
    </div>
  );
}

function LogList({ entries }: { entries: GameLogEntry[] }) {
  if (entries.length === 0) {
    return <EmptyState label="No accepted server events yet" />;
  }

  return (
    <ol className="grid max-h-80 gap-2 overflow-auto text-xs text-slate-200">
      {entries.map((entry) => (
        <li key={entry.id} className="rounded bg-white/5 p-2">
          <div className="text-[10px] uppercase text-slate-500">Event {entry.sequence}</div>
          <div>{entry.message}</div>
        </li>
      ))}
    </ol>
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
      <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.08em] text-slate-400/80">
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

function ZoneCards({ cards, mirrored = false }: { cards: Card[]; mirrored?: boolean }) {
  if (cards.length === 0) {
    return <EmptyState label="Empty" />;
  }

  return (
    <div className="flex h-full items-center justify-center gap-2">
      {cards.map((card, index) => (
        <CardImage
          key={`${card.name}-${index}`}
          card={card}
          className={`w-20 ${mirrored ? "rotate-180" : ""}`}
        />
      ))}
    </div>
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

function CardBack({
  className = "",
  style
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- Local static asset is used directly for hidden cards.
    <img
      alt="Hidden card"
      className={`aspect-[744/1039] rounded-md border border-black/60 object-cover shadow shadow-black/30 ${className}`}
      src={cardBackImage.src}
      style={style}
    />
  );
}

function CountBadge({ value }: { value: number }) {
  return (
    <div className="absolute -top-2 left-1/2 -translate-x-1/2 rounded bg-[#111827] px-2 py-0.5 text-base font-bold">
      {value}
    </div>
  );
}

function CardFromId({
  cardInstanceId,
  cardsByInstanceId,
  className
}: {
  cardInstanceId: string;
  cardsByInstanceId: Record<string, Card>;
  className?: string;
}) {
  const card = cardsByInstanceId[cardInstanceId];

  if (!card) {
    return <CardBack className={className} />;
  }

  return <CardImage card={card} className={className} />;
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

function zoneCards(zone: ProjectedZone, cardsByInstanceId: Record<string, Card>): Card[] {
  return zone.cardInstanceIds.flatMap((cardInstanceId) =>
    cardFromId(cardInstanceId, cardsByInstanceId)
  );
}

function cardFromId(
  cardInstanceId: string,
  cardsByInstanceId: Record<string, Card>
): Card[] {
  const card = cardsByInstanceId[cardInstanceId];

  return card ? [card] : [];
}

function handStyle(index: number, total: number): CSSProperties {
  const middle = (total - 1) / 2;
  const offset = index - middle;
  const rotate = Math.max(-10, Math.min(10, offset * 5));

  return {
    "--hand-rotate": `${rotate}deg`
  } as CSSProperties;
}
