"use client";

import { FC } from "react";
import { ScoreTrack } from "./score-track";
import { GameScore } from "../types";

export const ScoreHeader: FC<GameScore> = ({ opponent, player }) => {
  return (
    <header className="items-center grid grid-cols-[160px_1fr_160px]">
      <div className="bg-player-accent h-full font-semibold text-sm">
        {player.name}
      </div>
      <div className="flex justify-center">
        <ScoreTrack playerScore={player.score} opponentScore={opponent.score} />
      </div>
      <div className="bg-opponent-accent font-semibold text-sm text-right">
        {opponent.name}
      </div>
    </header>
  );
};
