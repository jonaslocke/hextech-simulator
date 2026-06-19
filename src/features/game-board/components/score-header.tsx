"use client";

import { FC } from "react";
import { ScoreTrack } from "./score-track";
import { GameScore } from "../types";
import { cn } from "@/shared/utils/cn";

const SeatName = ({
  name,
  seat,
}: {
  name: string;
  seat: "player" | "opponent";
}) => (
  <div
    className={cn(
      "px-4 py-2 rounded-md font-semibold text-sm",
      seat === "opponent" ? "bg-opponent-accent" : "bg-player-accent",
    )}
  >
    {name}
  </div>
);

export const ScoreHeader: FC<GameScore> = ({ opponent, player }) => {
  return (
    <header className="flex justify-center items-center p-2">
      <SeatName name={player.name} seat="player" />
      <div className="flex flex-1 justify-center">
        <ScoreTrack playerScore={player.score} opponentScore={opponent.score} />
      </div>
      <SeatName name={opponent.name} seat="opponent" />
    </header>
  );
};
