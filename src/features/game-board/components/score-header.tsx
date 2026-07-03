"use client";

import { FC, CSSProperties } from "react";
import { Hand } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { GameScore } from "../types";
import { ScoreTrack } from "./score-track";

const SeatName = ({
  handCount,
  name,
  seat,
}: {
  handCount: number;
  name: string;
  seat: "player" | "opponent";
}) => {
  const isOpponent = seat === "opponent";

  const seatStyle = {
    "--seat-accent": isOpponent
      ? "var(--opponent-accent)"
      : "var(--player-accent)",
    "--seat-accent-soft": isOpponent
      ? "var(--opponent-accent-soft)"
      : "var(--player-accent-soft)",
    borderLeftColor: isOpponent ? undefined : "var(--seat-accent)",
    borderRightColor: isOpponent ? "var(--seat-accent)" : undefined,
  } as CSSProperties;

  return (
    <div
      className={cn(
        "relative flex items-center gap-2 border border-white/10 rounded-md overflow-hidden",
        "bg-slate-950/28 px-3 py-1.5 font-semibold text-sm text-slate-100",
        "shadow-[0_8px_20px_rgba(0,0,0,0.28)] ring-1 ring-white/5",
        "supports-backdrop-filter:bg-slate-950/16 supports-backdrop-filter:backdrop-blur-md",
        "transition-[background-color,border-color,box-shadow] duration-300 ease-out",
        isOpponent ? "border-r-[3px]" : "border-l-[3px]",
      )}
      style={seatStyle}
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 opacity-100 pointer-events-none"
        style={{
          background: `linear-gradient(${isOpponent ? "270deg" : "90deg"}, var(--seat-accent-soft), transparent 68%)`,
        }}
      />
      <span
        aria-hidden="true"
        className="absolute inset-0 opacity-70 pointer-events-none"
        style={{
          boxShadow: `inset ${isOpponent ? "-" : ""}10px 0 18px -18px var(--seat-accent)`,
        }}
      />
      <span className="z-10 relative truncate">{name}</span>
      <span
        aria-label={`${handCount} cards in hand`}
        className="inline-flex z-10 relative items-center gap-1 bg-white/10 shadow-black/20 shadow-inner px-2 py-0.5 border border-white/10 rounded-md font-semibold text-slate-100/90 text-xs"
        title={`${handCount} cards in hand`}
      >
        <Hand className="opacity-85 size-3.5" />
        {handCount}
      </span>
    </div>
  );
};

export const ScoreHeader: FC<GameScore & { victoryScore: number }> = ({
  opponent,
  player,
  victoryScore,
}) => {
  return (
    <header className="flex justify-center items-center p-2">
      <SeatName
        handCount={player.zones.hand.count}
        name={player.name}
        seat="player"
      />
      <div className="flex flex-1 justify-center">
        <ScoreTrack
          playerScore={player.score}
          opponentScore={opponent.score}
          victoryScore={victoryScore}
        />
      </div>
      <SeatName
        handCount={opponent.zones.hand.count}
        name={opponent.name}
        seat="opponent"
      />
    </header>
  );
};
