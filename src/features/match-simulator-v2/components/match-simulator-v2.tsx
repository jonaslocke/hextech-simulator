"use client";

import { useEffect, useState } from "react";
import { GameBoardV2 } from "@/features/game-board-v2";
import { Button } from "@/shared/components/button";
import { createMatchV2Client, loadProjectionV2Client, performActionV2Client } from "../api";
import type { AcceptedMatchV2, SeatKeyV2 } from "../types";

export function MatchSimulatorV2() {
  const [match, setMatch] = useState<AcceptedMatchV2 | null>(null);
  const [viewerSeat, setViewerSeat] = useState<SeatKeyV2>("player1");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const viewer = match?.players[viewerSeat];
  const projection = viewer && match?.projections[viewer.playerId];
  const currentMatchId = match?.matchId;
  const viewerPlayerId = viewer?.playerId;
  const viewerToken = viewer?.playerToken;

  useEffect(() => {
    if (!currentMatchId || !viewerPlayerId || !viewerToken) return;
    let active = true;
    void loadProjectionV2Client(currentMatchId, viewerToken).then((result) => {
      if (!active || !result.accepted) return;
      setMatch((current) => current ? { ...current, projections: { ...current.projections, [viewerPlayerId]: result.projection } } : current);
    });
    return () => { active = false; };
  }, [currentMatchId, viewerPlayerId, viewerToken]);

  async function createMatch() {
    setBusy(true); setError(null);
    try {
      const result = await createMatchV2Client();
      if (!result.accepted) setError(result.error.message);
      else { setMatch(result); setViewerSeat("player1"); }
    } catch { setError("Unable to create the match."); }
    finally { setBusy(false); }
  }

  async function performAction(input: { actionId: string; selectedIds: string[] }) {
    if (!match || !viewer || !projection) return;
    setBusy(true); setError(null);
    try {
      const result = await performActionV2Client({ matchId: match.matchId, playerToken: viewer.playerToken, stateVersion: projection.stateVersion, ...input });
      if (!result.accepted) setError(result.error.message);
      else setMatch((current) => current ? { ...current, projections: { ...current.projections, [viewer.playerId]: result.projection } } : current);
    } catch { setError("The action request failed."); }
    finally { setBusy(false); }
  }

  if (!match || !projection) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 p-6 text-slate-100">
        <section className="w-full max-w-xl rounded-xl border border-cyan-300/20 bg-slate-900 p-6 shadow-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">Riftbound Simulator</p>
          <h1 className="mt-2 text-2xl font-semibold">Create match</h1>
          <p className="mt-2 text-sm text-slate-400">Choose a deck for each player and start a Riftbound match.</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {(["Player 1", "Player 2"] as const).map((label) => (
              <label className="grid gap-2 text-sm" key={label}>
                <span className="text-slate-300">{label} deck</span>
                <select className="rounded border border-white/10 bg-slate-950 px-3 py-2" disabled value="lux"><option value="lux">Lux</option></select>
              </label>
            ))}
          </div>
          {error && <p className="mt-4 rounded border border-red-400/40 bg-red-950/60 px-3 py-2 text-sm text-red-100">{error}</p>}
          <Button className="mt-5 w-full" disabled={busy} onClick={createMatch} type="button">{busy ? "Creating…" : "Create match"}</Button>
          <a className="mt-4 block text-center text-xs text-slate-500 underline hover:text-slate-300" href="/legacy">Open previous version</a>
        </section>
      </main>
    );
  }

  return (
    <div className="relative">
      <div className="fixed right-4 top-4 z-[60] flex items-center gap-2 rounded bg-slate-950/95 p-2 text-xs text-slate-100 shadow-xl">
        <span className="text-slate-400">Viewer</span>
        <Button onClick={() => setViewerSeat("player1")} size="sm" type="button" variant={viewerSeat === "player1" ? "default" : "secondary"}>Player 1</Button>
        <Button onClick={() => setViewerSeat("player2")} size="sm" type="button" variant={viewerSeat === "player2" ? "default" : "secondary"}>Player 2</Button>
      </div>
      {error && <div className="fixed bottom-4 right-4 z-[60] rounded border border-red-400/40 bg-red-950 px-3 py-2 text-sm text-red-100">{error}</div>}
      <GameBoardV2 onPerformAction={(input) => { if (!busy) void performAction(input); }} projection={projection} />
    </div>
  );
}
