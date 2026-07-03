"use client";

import type { GameProjection } from "@/shared/game";
import { Button } from "@/shared/components/button";
import { DialogPortal } from "@/shared/components/dialog-portal";

export function MatchResultDialog({
  busy,
  onCreateMatch,
  projection,
}: {
  busy: boolean;
  onCreateMatch: () => void;
  projection: GameProjection;
}) {
  if (projection.status !== "complete" || !projection.winnerPlayerId) {
    return null;
  }

  const viewerWon = projection.winnerPlayerId === projection.viewerPlayerId;
  const winner = projection.players.find(
    (player) => player.playerId === projection.winnerPlayerId,
  );
  const loser = projection.players.find(
    (player) => player.playerId !== projection.winnerPlayerId,
  );

  return (
    <DialogPortal>
      <div className="z-[2147483647] fixed inset-0 flex justify-center items-center bg-black/70 backdrop-blur-sm p-4 text-slate-100">
        <section
          aria-modal="true"
          className="gap-5 grid bg-slate-950/92 shadow-2xl shadow-black/80 p-6 border border-amber-300/35 rounded-xl w-full max-w-md text-center"
          role="dialog"
        >
          <header>
            <p className="font-semibold text-amber-200 text-xs uppercase tracking-[0.2em]">
              Match complete
            </p>
            <h2 className="mt-2 font-semibold text-3xl">
              {viewerWon ? "Victory" : "Defeat"}
            </h2>
            <p className="mt-2 text-slate-300 text-sm">
              {projection.winnerPlayerId} reached the Victory Score.
            </p>
          </header>

          <div className="grid grid-cols-3 items-center bg-white/5 p-3 border border-white/10 rounded-lg">
            <div>
              <p className="text-slate-400 text-xs">Winner</p>
              <p className="font-semibold text-lg">{winner?.points ?? 0}</p>
            </div>
            <div>
              <p className="text-slate-400 text-xs">Victory Score</p>
              <p className="font-semibold text-amber-200 text-lg">
                {projection.victoryScore}
              </p>
            </div>
            <div>
              <p className="text-slate-400 text-xs">Opponent</p>
              <p className="font-semibold text-lg">{loser?.points ?? 0}</p>
            </div>
          </div>

          <Button disabled={busy} onClick={onCreateMatch} type="button">
            {busy ? "Creating…" : "Create New Match"}
          </Button>
        </section>
      </div>
    </DialogPortal>
  );
}
