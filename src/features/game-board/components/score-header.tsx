"use client";

import { FC } from "react";
import { ScoreTrack } from "./score-track";
import { GameScore } from "../types";
import { cn } from "@/shared/utils/cn";
import { Hand } from "lucide-react";

const SeatName = ({
  handCount,
  name,
  seat,
}: {
  handCount: number;
  name: string;
  seat: "player" | "opponent";
}) => (
  <div
    className={cn(
      "flex items-center gap-2 px-4 py-2 rounded-md font-semibold text-sm",
      seat === "opponent" ? "bg-opponent-accent" : "bg-player-accent",
    )}
  >
    <span>{name}</span>
    <span
      aria-label={`${handCount} cards in hand`}
      className="inline-flex items-center gap-1 rounded bg-black/25 px-2 py-0.5 text-xs text-slate-100"
      title={`${handCount} cards in hand`}
    >
      <Hand className="size-3.5" />
      {handCount}
    </span>
  </div>
);

export const ScoreHeader: FC<GameScore> = ({ opponent, player }) => {
  return (
    <header className="flex justify-center items-center p-2">
      <SeatName
        handCount={player.zones.hand.count}
        name={player.name}
        seat="player"
      />
      <div className="flex flex-1 justify-center">
        <ScoreTrack playerScore={player.score} opponentScore={opponent.score} />
      </div>
      <SeatName
        handCount={opponent.zones.hand.count}
        name={opponent.name}
        seat="opponent"
      />
    </header>
  );
};
