"use client";

import { Hand } from "lucide-react";
import type { CSSProperties, FC } from "react";
import { cn } from "@/shared/utils/cn";
import type { GameScore } from "../types";
import { ScoreTrack } from "./score-track";

const PLAYER_ACCENT = "var(--player-accent)";
const PLAYER_ACCENT_SOFT = "var(--player-accent-soft)";
const OPPONENT_ACCENT = "var(--opponent-accent)";
const OPPONENT_ACCENT_SOFT = "var(--opponent-accent-soft)";

type Seat = "player" | "opponent";

export type MatchHudContext = {
  gameNumber: number;
  scoreByPlayerId: Readonly<Partial<Record<string, number>>>;
};

type ScoreHeaderProps = GameScore & {
  matchContext?: MatchHudContext;
  victoryScore: number;
};

function getSeatAccent(seat: Seat) {
  return seat === "opponent"
    ? {
        accent: OPPONENT_ACCENT,
        accentSoft: OPPONENT_ACCENT_SOFT,
      }
    : {
        accent: PLAYER_ACCENT,
        accentSoft: PLAYER_ACCENT_SOFT,
      };
}

function MatchScoreBadge({ name, score }: { name: string; score: number }) {
  const accessibleLabel = `${name} has won ${score} ${
    score === 1 ? "game" : "games"
  } in this match`;

  return (
    <span
      aria-label={accessibleLabel}
      className={cn(
        "inline-flex z-10 relative justify-center items-center size-6 shrink-0",
        "rounded-full border font-mono text-xs font-bold tabular-nums",
      )}
      style={
        {
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--seat-accent) 24%, rgba(15,23,42,0.9)), color-mix(in srgb, var(--seat-accent) 10%, rgba(2,6,23,0.96)))",
          borderColor:
            "color-mix(in srgb, var(--seat-accent) 58%, transparent)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.12), 0 0 12px color-mix(in srgb, var(--seat-accent) 18%, transparent)",
          color: "var(--seat-accent)",
        } as CSSProperties
      }
      title={accessibleLabel}
    >
      {score}
    </span>
  );
}

function HandCountBadge({
  handCount,
  name,
}: {
  handCount: number;
  name: string;
}) {
  const accessibleLabel = `${name} has ${handCount} ${
    handCount === 1 ? "card" : "cards"
  } in hand`;

  return (
    <span
      aria-label={accessibleLabel}
      className={cn(
        "inline-flex z-10 relative items-center gap-1 shrink-0",
        "rounded-md border border-white/10 bg-white/10 px-2 py-0.5",
        "text-xs font-semibold text-slate-100/90",
        "shadow-inner shadow-black/20",
      )}
      title={accessibleLabel}
    >
      <Hand aria-hidden="true" className="opacity-85 size-3.5" />
      <span className="tabular-nums">{handCount}</span>
    </span>
  );
}

function PlayerHudPlate({
  handCount,
  matchScore,
  name,
  seat,
}: {
  handCount: number;
  matchScore?: number;
  name: string;
  seat: Seat;
}) {
  const isOpponent = seat === "opponent";
  const { accent, accentSoft } = getSeatAccent(seat);

  const seatStyle = {
    "--seat-accent": accent,
    "--seat-accent-soft": accentSoft,
    borderLeftColor: isOpponent ? undefined : "var(--seat-accent)",
    borderRightColor: isOpponent ? "var(--seat-accent)" : undefined,
  } as CSSProperties;

  const handBadge = <HandCountBadge handCount={handCount} name={name} />;

  const scoreBadge =
    matchScore === undefined ? null : (
      <MatchScoreBadge name={name} score={matchScore} />
    );

  return (
    <div
      className={cn(
        "relative flex items-center gap-2 min-w-0 max-w-full overflow-hidden",
        "rounded-md border border-white/10 px-2.5 py-1.5",
        "bg-slate-950/28 text-sm font-semibold text-slate-100",
        "shadow-[0_8px_20px_rgba(0,0,0,0.28)] ring-1 ring-white/5",
        "supports-backdrop-filter:bg-slate-950/16",
        "supports-backdrop-filter:backdrop-blur-md",
        "transition-[background-color,border-color,box-shadow] duration-300 ease-out",
        isOpponent ? "border-r-[3px]" : "border-l-[3px]",
      )}
      style={seatStyle}
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `linear-gradient(
            ${isOpponent ? "270deg" : "90deg"},
            var(--seat-accent-soft),
            transparent 68%
          )`,
        }}
      />

      <span
        aria-hidden="true"
        className="absolute inset-0 opacity-70 pointer-events-none"
        style={{
          boxShadow: `inset ${
            isOpponent ? "-" : ""
          }10px 0 18px -18px var(--seat-accent)`,
        }}
      />

      {isOpponent ? handBadge : scoreBadge}

      <span
        className={cn(
          "z-10 relative min-w-0 max-w-36 truncate",
          isOpponent ? "text-right" : "text-left",
        )}
        title={name}
      >
        {name}
      </span>

      {isOpponent ? scoreBadge : handBadge}
    </div>
  );
}

function GameNumberLabel({ gameNumber }: { gameNumber: number }) {
  return (
    <span
      aria-label={`Current match game ${gameNumber}`}
      className={cn(
        "-mt-0.5 border rounded-b-md select-none",
        "px-3 py-1",
        "font-mono text-[10px] font-semibold uppercase tracking-[0.16em]",
        "text-slate-200",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_6px_18px_rgba(0,0,0,0.22)]",
        "ring-1 ring-inset ring-white/5 border-t-0",
        "bg-slate-550/30 supports-backdrop-filter:bg-slate-550/18 supports-backdrop-filter:backdrop-blur-md border border-white/10",
      )}
    >
      Game {gameNumber}
    </span>
  );
}

export const ScoreHeader: FC<ScoreHeaderProps> = ({
  matchContext,
  opponent,
  player,
  victoryScore,
}) => {
  const playerMatchScore = matchContext
    ? (matchContext.scoreByPlayerId[player.playerId] ?? 0)
    : undefined;

  const opponentMatchScore = matchContext
    ? (matchContext.scoreByPlayerId[opponent.playerId] ?? 0)
    : undefined;

  return (
    <header
      className={cn(
        "items-start gap-2 grid px-2 pt-2 pb-1",
        "grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]",
      )}
    >
      <div className="justify-self-start min-w-0">
        <PlayerHudPlate
          handCount={player.zones.hand.count}
          matchScore={playerMatchScore}
          name={player.name}
          seat="player"
        />
      </div>

      <div className="flex flex-col items-center">
        <ScoreTrack
          opponentAccent={OPPONENT_ACCENT}
          opponentScore={opponent.score}
          playerAccent={PLAYER_ACCENT}
          playerScore={player.score}
          victoryScore={victoryScore}
        />

        {matchContext ? (
          <GameNumberLabel gameNumber={matchContext.gameNumber} />
        ) : null}
      </div>

      <div className="justify-self-end min-w-0">
        <PlayerHudPlate
          handCount={opponent.zones.hand.count}
          matchScore={opponentMatchScore}
          name={opponent.name}
          seat="opponent"
        />
      </div>
    </header>
  );
};
