"use client";

import type { MatchProjection } from "@/shared/game";

export function MatchScoreBar({ projection }: { projection: MatchProjection }) {
  const players = projection.currentGame.players;

  return (
    <div className="top-3 left-1/2 z-50 fixed flex items-center gap-3 bg-slate-950/90 shadow-lg px-3 py-2 border border-cyan-300/20 rounded-lg text-slate-100 text-xs -translate-x-1/2">
      <span className="font-semibold text-cyan-200 uppercase tracking-[0.16em]">
        BO3
      </span>
      {players.map((player, index) => (
        <span className="flex items-center gap-2" key={player.playerId}>
          {index > 0 && <span className="text-slate-500">vs</span>}
          <span className="max-w-28 truncate text-slate-300">
            {player.displayName}
          </span>
          <span className="font-semibold tabular-nums text-cyan-100">
            {projection.scoreByPlayerId[player.playerId] ?? 0}
          </span>
        </span>
      ))}
      <span className="text-slate-500">Game {projection.gameNumber}</span>
    </div>
  );
}
