"use client";

import { ScoreTrack } from "./ScoreTrack";

export function ScoreHeader({
  playerScore,
  opponentScore,
}: {
  playerScore: number;
  opponentScore: number;
}) {
  return (
    <header className="items-center grid grid-cols-[160px_1fr_160px] bg-[#3f3f3f] px-4">
      <div className="font-semibold text-sm">Player 1</div>
      <div className="flex justify-center">
        <ScoreTrack playerScore={playerScore} opponentScore={opponentScore} />
      </div>
      <div className="font-semibold text-sm text-right">Player 2</div>
    </header>
  );
}
