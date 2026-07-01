"use client";

import { GameBoardV2 } from "@/features/game-board-v2";
import { Button } from "@/shared/components/button";
import { ChoiceDialog } from "@/shared/components/choice-dialog2";
import { useEffect, useState } from "react";
import {
  createMatchV2Client,
  loadProjectionV2Client,
  performActionV2Client,
} from "../api";
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
    if (!currentMatchId || !viewerPlayerId || !viewerToken) {
      return;
    }

    let active = true;

    void loadProjectionV2Client(currentMatchId, viewerToken).then((result) => {
      if (!active || !result.accepted) {
        return;
      }

      setMatch((current) =>
        current
          ? {
              ...current,
              projections: {
                ...current.projections,
                [viewerPlayerId]: result.projection,
              },
            }
          : current,
      );
    });

    return () => {
      active = false;
    };
  }, [currentMatchId, viewerPlayerId, viewerToken]);

  async function createMatch() {
    setBusy(true);
    setError(null);

    try {
      const result = await createMatchV2Client();

      if (!result.accepted) {
        setError(result.error.message);
      } else {
        setMatch(result);
        setViewerSeat("player1");
      }
    } catch {
      setError("Unable to create the match.");
    } finally {
      setBusy(false);
    }
  }

  async function performAction(input: {
    actionId: string;
    selectedIds: string[];
  }) {
    if (!match || !viewer || !projection) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const result = await performActionV2Client({
        matchId: match.matchId,
        playerToken: viewer.playerToken,
        stateVersion: projection.stateVersion,
        ...input,
      });

      if (!result.accepted) {
        setError(result.error.message);
      } else {
        setMatch((current) =>
          current
            ? {
                ...current,
                projections: {
                  ...current.projections,
                  [viewer.playerId]: result.projection,
                },
              }
            : current,
        );
      }
    } catch {
      setError("The action request failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!match || !projection) {
    return (
      <main className="place-items-center grid bg-slate-950 p-6 min-h-screen text-slate-100">
        <section className="bg-slate-900 shadow-2xl p-6 border border-cyan-300/20 rounded-xl w-full max-w-xl">
          <p className="font-semibold text-cyan-200 text-xs uppercase tracking-[0.2em]">
            Riftbound Simulator
          </p>
          <h1 className="mt-2 font-semibold text-2xl">Create match</h1>
          <p className="mt-2 text-slate-400 text-sm">
            Choose a deck for each player and start a Riftbound match.
          </p>
          <div className="gap-4 grid sm:grid-cols-2 mt-5">
            {(["Player 1", "Player 2"] as const).map((label) => (
              <label className="gap-2 grid text-sm" key={label}>
                <span className="text-slate-300">{label} deck</span>
                <select
                  className="bg-slate-950 px-3 py-2 border border-white/10 rounded"
                  disabled
                  value="lux"
                >
                  <option value="lux">Lux</option>
                </select>
              </label>
            ))}
          </div>
          {error && (
            <p className="bg-red-950/60 mt-4 px-3 py-2 border border-red-400/40 rounded text-red-100 text-sm">
              {error}
            </p>
          )}
          <Button
            className="mt-5 w-full"
            disabled={busy}
            onClick={createMatch}
            type="button"
          >
            {busy ? "Creating…" : "Create match"}
          </Button>
          <a
            className="block mt-4 text-slate-500 hover:text-slate-300 text-xs text-center underline"
            href="/legacy"
          >
            Open previous version
          </a>
        </section>
      </main>
    );
  }

  const battlefieldActions = projection.actions.filter(
    (action) => action.presentation.surface === "setup-dialog",
  );
  const startingPlayerAction = projection.actions.find((action) =>
    action.targets.some((target) => target.kind === "player"),
  );
  const mulliganAction = projection.actions.find(
    (action) => action.label === "Keep opening hand",
  );
  const handCards =
    projection.players
      .find((player) => player.playerId === projection.viewerPlayerId)
      ?.zones.find((zone) => zone.kind === "hand")?.cards ?? [];

  const battlefieldOptions = battlefieldActions.map((action) => {
    const card = projection.setup.battlefieldPool.find(
      (candidate) => candidate.instanceId === action.sourceCardInstanceId,
    );

    return {
      id: action.id,
      imageUrl: card?.imageUrl ?? undefined,
      label: card?.name ?? action.label,
    };
  });

  const startingPlayerOptions =
    startingPlayerAction?.targets[0]?.legalIds.map((playerId) => ({
      description:
        playerId === viewer.playerId
          ? "You take the first turn."
          : "Your opponent takes the first turn.",
      id: playerId,
      label:
        playerId === match.players.player1.playerId ? "Player 1" : "Player 2",
    })) ?? [];

  const mulliganOptions = handCards.map((card) => ({
    id: card.instanceId,
    imageUrl: card.imageUrl ?? undefined,
    label: card.name,
  }));

  return (
    <main className="relative bg-slate-950 min-h-screen">
      <div className="top-2 left-14 z-50 absolute flex items-center gap-2 bg-slate-950/90 shadow px-2 py-1 rounded text-slate-100 text-xs">
        <span className="text-slate-400">Viewer</span>
        <Button
          onClick={() => setViewerSeat("player1")}
          size="sm"
          type="button"
          variant={viewerSeat === "player1" ? "default" : "secondary"}
        >
          Player 1
        </Button>
        <Button
          onClick={() => setViewerSeat("player2")}
          size="sm"
          type="button"
          variant={viewerSeat === "player2" ? "default" : "secondary"}
        >
          Player 2
        </Button>
        <span className="text-slate-400">
          Match {match.matchId} - State {projection.stateVersion}
        </span>
      </div>

      {error && (
        <div className="right-4 bottom-4 z-[60] fixed bg-red-950 px-3 py-2 border border-red-400/40 rounded text-red-100 text-sm">
          {error}
        </div>
      )}

      <ChoiceDialog
        cardSize="xl"
        confirmLabel="Lock battlefield"
        description={
          projection.setup.startingPlayerId
            ? `${
                projection.setup.startingPlayerId ===
                match.players.player1.playerId
                  ? "Player 1"
                  : "Player 2"
              } starts this game. This battlefield will be revealed after both players lock their choices.`
            : "Turn order will be determined after both players lock their battlefield choices."
        }
        isOpen={battlefieldOptions.length > 0}
        onConfirm={([actionId]) => {
          if (actionId) {
            void performAction({ actionId, selectedIds: [] });
          }
        }}
        options={battlefieldOptions}
        presentation="cards"
        selectionMode="single"
        title="Choose Battlefield"
      />

      <ChoiceDialog
        confirmLabel="Choose starting player"
        description="The selected player will take the first turn of this game."
        isOpen={Boolean(startingPlayerAction)}
        onConfirm={([playerId]) => {
          if (playerId && startingPlayerAction) {
            void performAction({
              actionId: startingPlayerAction.id,
              selectedIds: [playerId],
            });
          }
        }}
        options={startingPlayerOptions}
        presentation="list"
        selectionMode="single"
        title="Choose Starting Player"
      />

      <ChoiceDialog
        confirmLabel={(selectedIds) =>
          selectedIds.length ? "Mulligan selected" : "Keep opening hand"
        }
        description="Keep your hand or replace up to two cards."
        isOpen={Boolean(mulliganAction)}
        maxSelected={2}
        minSelected={0}
        onConfirm={(selectedIds) => {
          if (mulliganAction) {
            void performAction({ actionId: mulliganAction.id, selectedIds });
          }
        }}
        options={mulliganOptions}
        presentation="cards"
        selectionMode="multiple"
        title="Choose Mulligan"
      />

      {projection.setup.waitingReason && (
        <SetupWaitingOverlay detail={projection.setup.waitingReason} />
      )}

      <GameBoardV2
        onPerformAction={(input) => {
          if (!busy) {
            void performAction(input);
          }
        }}
        projection={projection}
      />
    </main>
  );
}

function SetupWaitingOverlay({ detail }: { detail: string }) {
  return (
    <div className="z-[2147483645] fixed inset-0 flex justify-center items-center bg-black/70 backdrop-blur-sm p-4 text-slate-100">
      <section
        aria-live="polite"
        className="gap-3 grid bg-slate-950/95 shadow-2xl shadow-black/80 p-5 border border-cyan-300/25 rounded-xl w-full max-w-md overflow-hidden text-center"
        role="status"
      >
        <p className="font-semibold text-cyan-200/80 text-xs uppercase tracking-[0.18em]">
          Setup
        </p>
        <div>
          <h2 className="font-semibold text-lg leading-tight">
            Waiting for opponent
          </h2>
          <p className="mt-2 text-slate-400 text-sm leading-6">{detail}</p>
        </div>
      </section>
    </div>
  );
}
