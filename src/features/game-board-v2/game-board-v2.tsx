"use client";

import { useMemo, useState } from "react";
import { Button } from "@/shared/components/button";
import type { GameProjectionV2, ProjectedAction } from "@/shared/game-v2";
import { actionsForSource, visibleCards } from "./model";
import { ProjectedCard } from "./components/projected-card";
import { ZonePanel } from "./components/zone-panel";

export function GameBoardV2({
  onPerformAction,
  projection
}: {
  onPerformAction: (input: { actionId: string; selectedIds: string[] }) => void;
  projection: GameProjectionV2;
}) {
  const [pendingAction, setPendingAction] = useState<ProjectedAction | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const viewer = projection.players.find((player) => player.playerId === projection.viewerPlayerId)!;
  const opponent = projection.players.find((player) => player.playerId !== projection.viewerPlayerId)!;
  const cardsById = useMemo(
    () => new Map(visibleCards(projection).map((card) => [card.instanceId, card])),
    [projection]
  );

  const beginAction = (action: ProjectedAction) => {
    if (!action.enabled) return;
    if (action.targets.length === 0 || action.targets.every((target) => target.maximum === 0)) {
      onPerformAction({ actionId: action.id, selectedIds: [] });
      return;
    }
    setSelectedIds([]);
    setPendingAction(action);
  };
  const target = pendingAction?.targets[0];
  const canSubmit = target
    ? selectedIds.length >= target.minimum && selectedIds.length <= target.maximum
    : false;

  return (
    <main className="min-h-screen bg-slate-950 p-4 text-slate-100">
      <header className="mb-4 flex items-center justify-between rounded-lg border border-white/10 bg-slate-900 p-3">
        <div><h1 className="font-semibold">Game Engine V2</h1><p className="text-xs text-slate-400">State {projection.stateVersion}</p></div>
        <div className="flex gap-2">
          {actionsForSource(projection.actions, null).map((action) => (
            <Button disabled={!action.enabled} key={action.id} onClick={() => beginAction(action)} size="sm" type="button">{action.label}</Button>
          ))}
        </div>
      </header>

      <div className="grid gap-4">
        <PlayerArea actions={projection.actions} label="Opponent" onAction={beginAction} player={opponent} />
        <section className="rounded-xl border border-cyan-300/20 bg-slate-900/60 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-cyan-200">Battlefields</h2>
          <div className="flex flex-wrap gap-4">
            {projection.battlefields.map((battlefield) => (
              <div className="rounded-lg border border-white/10 p-3" key={battlefield.battlefieldId}>
                <ProjectedCard actions={actionsForSource(projection.actions, battlefield.card.instanceId)} card={battlefield.card} onAction={beginAction} />
                <div className="mt-3 flex flex-wrap gap-2">
                  {battlefield.units.map((card) => <ProjectedCard actions={actionsForSource(projection.actions, card.instanceId)} card={card} key={card.instanceId} onAction={beginAction} />)}
                </div>
              </div>
            ))}
          </div>
        </section>
        <PlayerArea actions={projection.actions} label="You" onAction={beginAction} player={viewer} />
      </div>

      {pendingAction && target && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-6">
          <section className="w-full max-w-xl rounded-lg border border-cyan-300/30 bg-slate-900 p-4">
            <h2 className="font-semibold">{pendingAction.label}</h2>
            <p className="mt-1 text-sm text-slate-400">Select {target.minimum}–{target.maximum} targets.</p>
            <div className="mt-3 grid gap-2">
              {target.legalIds.map((id) => (
                <Button key={id} onClick={() => setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id].slice(0, target.maximum))} type="button" variant={selectedIds.includes(id) ? "default" : "secondary"}>
                  {cardsById.get(id)?.name ?? id}
                </Button>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button onClick={() => setPendingAction(null)} type="button" variant="secondary">Cancel</Button>
              <Button disabled={!canSubmit} onClick={() => { onPerformAction({ actionId: pendingAction.id, selectedIds }); setPendingAction(null); }} type="button">Confirm</Button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function PlayerArea({ actions, label, onAction, player }: {
  actions: readonly ProjectedAction[];
  label: string;
  onAction: (action: ProjectedAction) => void;
  player: GameProjectionV2["players"][number];
}) {
  return (
    <section className="rounded-xl border border-white/10 bg-slate-900/50 p-4">
      <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">{label}</h2><span className="text-sm text-slate-400">Energy {player.energy}</span></div>
      <div className="grid gap-3 xl:grid-cols-2">
        {player.zones.map((zone) => <ZonePanel actions={actions} key={zone.kind} onAction={onAction} zone={zone} />)}
      </div>
    </section>
  );
}

