"use client";

import { useEffect, useState } from "react";
import { GameBoardV2 } from "@/features/game-board-v2";
import { Button } from "@/shared/components/button";
import { ChoiceDialog } from "@/shared/components/choice-dialog";
import type { GameProjectionV2 } from "@/shared/game-v2";
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

  const battlefieldActions = projection.actions.filter((action) => action.presentation.surface === "setup-dialog");
  const startingPlayerAction = projection.actions.find((action) => action.targets.some((target) => target.kind === "player"));
  const mulliganAction = projection.actions.find((action) => action.label === "Keep opening hand");
  const battlefieldOptions = battlefieldActions.map((action) => {
    const card = projection.setup.battlefieldPool.find((candidate) => candidate.instanceId === action.sourceCardInstanceId);
    return {
      description: card?.rulesText,
      id: action.id,
      imageUrl: card?.imageUrl ?? undefined,
      label: card?.name ?? action.label
    };
  });
  const startingPlayerOptions = startingPlayerAction?.targets[0]?.legalIds.map((playerId) => ({
    description: playerId === viewer.playerId ? "You take the first turn." : "Your opponent takes the first turn.",
    id: playerId,
    label: playerId === match.players.player1.playerId ? "Player 1" : "Player 2"
  })) ?? [];

  return (
    <main className="relative bg-slate-950 min-h-screen">
      <div className="top-2 left-14 z-50 absolute flex items-center gap-2 bg-slate-950/90 shadow px-2 py-1 rounded text-slate-100 text-xs">
        <span className="text-slate-400">Viewer</span>
        <Button onClick={() => setViewerSeat("player1")} size="sm" type="button" variant={viewerSeat === "player1" ? "default" : "secondary"}>Player 1</Button>
        <Button onClick={() => setViewerSeat("player2")} size="sm" type="button" variant={viewerSeat === "player2" ? "default" : "secondary"}>Player 2</Button>
        <span className="text-slate-400">Match {match.matchId} - State {projection.stateVersion}</span>
      </div>
      {error && <div className="fixed bottom-4 right-4 z-[60] rounded border border-red-400/40 bg-red-950 px-3 py-2 text-sm text-red-100">{error}</div>}
      <ChoiceDialog
        confirmLabel="Lock battlefield"
        description={projection.setup.startingPlayerId
          ? `${projection.setup.startingPlayerId === match.players.player1.playerId ? "Player 1" : "Player 2"} starts this game. This battlefield will be revealed after both players lock their choices.`
          : "Turn order will be determined after both players lock their battlefield choices."}
        isOpen={battlefieldOptions.length > 0}
        onConfirm={([actionId]) => { if (actionId) void performAction({ actionId, selectedIds: [] }); }}
        options={battlefieldOptions}
        selectionMode="single"
        title="Choose Battlefield"
      />
      <ChoiceDialog
        confirmLabel="Choose starting player"
        description="The selected player will take the first turn of this game."
        isOpen={Boolean(startingPlayerAction)}
        onConfirm={([playerId]) => { if (playerId && startingPlayerAction) void performAction({ actionId: startingPlayerAction.id, selectedIds: [playerId] }); }}
        options={startingPlayerOptions}
        selectionMode="single"
        title="Choose Starting Player"
      />
      {mulliganAction && (
        <MulliganDialog
          cards={projection.players.find((player) => player.playerId === projection.viewerPlayerId)?.zones.find((zone) => zone.kind === "hand")?.cards ?? []}
          onConfirm={(selectedIds) => void performAction({ actionId: mulliganAction.id, selectedIds })}
        />
      )}
      {projection.setup.waitingReason && <SetupWaitingOverlay detail={projection.setup.waitingReason} />}
      <GameBoardV2 onPerformAction={(input) => { if (!busy) void performAction(input); }} projection={projection} />
    </main>
  );
}

function SetupWaitingOverlay({ detail }: { detail: string }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 p-6 text-slate-100">
      <section className="w-full max-w-md rounded-lg border border-cyan-300/25 bg-slate-950/95 p-5 text-center shadow-2xl shadow-black/70">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200/80">Setup</p>
        <h2 className="mt-2 text-lg font-semibold">Waiting for opponent</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">{detail}</p>
      </section>
    </div>
  );
}

function MulliganDialog({ cards, onConfirm }: {
  cards: GameProjectionV2["players"][number]["zones"][number]["cards"];
  onConfirm: (selectedIds: string[]) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  return (
    <div className="fixed inset-0 z-[2147483646] flex items-center justify-center bg-black/55 p-4">
      <section className="grid max-h-[min(42rem,calc(100vh-2rem))] w-full max-w-xl gap-4 overflow-hidden rounded-lg border border-cyan-300/25 bg-slate-950/95 p-4 text-slate-100 shadow-2xl shadow-black/70">
        <header><h2 className="text-lg font-semibold leading-tight">Choose Mulligan</h2><p className="mt-1 text-sm text-slate-400">Keep your hand or replace up to two cards.</p></header>
        <div className="grid max-h-[28rem] gap-2 overflow-auto pr-1">
          {cards.map((card) => {
            const selected = selectedIds.includes(card.instanceId);
            return <button className={`flex min-h-16 items-center gap-3 rounded-md border p-2 text-left transition ${selected ? "border-cyan-300 bg-cyan-300/15" : "border-white/10 bg-white/5 hover:border-cyan-300/40"}`} key={card.instanceId} onClick={() => setSelectedIds((current) => selected ? current.filter((id) => id !== card.instanceId) : [...current, card.instanceId].slice(0, 2))} type="button">
              {/* eslint-disable-next-line @next/next/no-img-element -- Projected card art may be remote. */}
              {card.imageUrl && <img alt="" className="h-16 w-12 shrink-0 rounded border border-white/10 object-cover" src={card.imageUrl} />}
              <span className="text-sm font-semibold">{card.name}</span>
            </button>;
          })}
        </div>
        <footer className="flex justify-end gap-2 border-t border-white/10 pt-3"><Button onClick={() => onConfirm(selectedIds)} type="button">{selectedIds.length ? "Mulligan selected" : "Keep opening hand"}</Button></footer>
      </section>
    </div>
  );
}
