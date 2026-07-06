"use client";

import { CardSelectionPrompt, GameBoard } from "@/features/game-board";
import { Button } from "@/shared/components/button";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  createMatchClient,
  loadDeckOptionsClient,
  loadProjectionClient,
  performActionClient,
} from "../api";
import type { DeckId } from "@/shared/game";
import type { AcceptedMatch, DeckOption, SeatKey } from "../types";
import { MatchResultDialog } from "./match-result-dialog";

type OnlinePlayerCredentials = {
  matchId: string;
  gameId: string;
  player: AcceptedMatch["players"]["player1"];
};

export function MatchSimulator({
  onlineMatch,
}: {
  onlineMatch?: OnlinePlayerCredentials;
}) {
  const onlineSeat: SeatKey =
    onlineMatch?.player.seat === "player-2" ? "player2" : "player1";
  const [match, setMatch] = useState<AcceptedMatch | null>(() =>
    onlineMatch ? createOnlineAcceptedMatch(onlineMatch) : null,
  );
  const [viewerSeat, setViewerSeat] = useState<SeatKey>(onlineSeat);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deckOptions, setDeckOptions] = useState<DeckOption[]>([]);
  const [playerDecks, setPlayerDecks] = useState<
    Record<SeatKey, DeckId>
  >({ player1: "lux", player2: "lux" });
  const viewer = match?.players[viewerSeat];
  const projection = viewer && match?.projections[viewer.playerId];
  const currentMatchId = match?.matchId;
  const viewerPlayerId = viewer?.playerId;
  const viewerToken = viewer?.playerToken;

  useEffect(() => {
    if (onlineMatch) return;
    let active = true;
    void loadDeckOptionsClient()
      .then(({ deckOptions: options }) => {
        if (!active) return;
        setDeckOptions(options);
        const fallback = options[0]?.id;
        if (fallback) {
          setPlayerDecks((current) => ({
            player1: options.some((option) => option.id === current.player1)
              ? current.player1
              : fallback,
            player2: options.some((option) => option.id === current.player2)
              ? current.player2
              : fallback,
          }));
        }
      })
      .catch(() => {
        if (active) setError("Unable to load available decks.");
      });
    return () => {
      active = false;
    };
  }, [onlineMatch]);

  useEffect(() => {
    if (!currentMatchId || !viewerPlayerId || !viewerToken) {
      return;
    }

    let active = true;

    void loadProjectionClient(currentMatchId, viewerToken).then((result) => {
      if (!active || !result.accepted) {
        return;
      }

      setMatch((current) =>
        updateProjection(current, viewerPlayerId, result.projection),
      );
    });

    return () => {
      active = false;
    };
  }, [currentMatchId, viewerPlayerId, viewerToken]);

  useEffect(() => {
    if (!onlineMatch || !currentMatchId || !viewerPlayerId || !viewerToken) {
      return;
    }

    const interval = window.setInterval(() => {
      void loadProjectionClient(currentMatchId, viewerToken).then((result) => {
        if (!result.accepted) return;
        setMatch((current) =>
          updateProjection(current, viewerPlayerId, result.projection),
        );
      });
    }, 1500);

    return () => window.clearInterval(interval);
  }, [
    currentMatchId,
    onlineMatch,
    viewerPlayerId,
    viewerToken,
  ]);

  async function createMatch() {
    setBusy(true);
    setError(null);

    try {
      const result = await createMatchClient(playerDecks);

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
    allocations?: Array<{ targetUnitId: string; amount: number }>;
  }) {
    if (!match || !viewer || !projection) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const result = await performActionClient({
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
      <main className="place-items-center grid bg-slate-950 p-6 min-h-screen text-slate-100 tabletop-background">
        <section className="bg-slate-900 shadow-2xl p-6 border border-cyan-300/20 rounded-xl w-full max-w-xl">
          <p className="font-semibold text-cyan-200 text-xs uppercase tracking-[0.2em]">
            Riftbound Simulator
          </p>
          <h1 className="mt-2 font-semibold text-2xl">Create match</h1>
          <p className="mt-2 text-slate-400 text-sm">
            Choose a deck for each player and start a Riftbound match.
          </p>
          <div className="gap-4 grid sm:grid-cols-2 mt-5">
            {([
              ["player1", "Player 1"],
              ["player2", "Player 2"],
            ] as const).map(([seat, label]) => (
              <label className="gap-2 grid text-sm" key={seat}>
                <span className="text-slate-300">{label} deck</span>
                <select
                  className="bg-slate-950 px-3 py-2 border border-white/10 rounded"
                  disabled={busy || deckOptions.length === 0}
                  onChange={(event) =>
                    setPlayerDecks((current) => ({
                      ...current,
                      [seat]: event.target.value as DeckId,
                    }))
                  }
                  value={playerDecks[seat]}
                >
                  {deckOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
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
            disabled={busy || deckOptions.length === 0}
            onClick={createMatch}
            type="button"
          >
            {busy ? "Creating…" : "Create match"}
          </Button>
          <Link
            className="block mt-4 text-cyan-300 hover:text-cyan-200 text-sm text-center"
            href="/online"
          >
            Play online instead
          </Link>
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
    <main className="relative bg-slate-950 min-h-screen tabletop-background">
      <div className="right-2 bottom-3 z-[2147483647] fixed flex items-center gap-2 bg-slate-950/90 shadow px-2 py-1 rounded text-slate-100 text-xs">
        <span className="text-slate-400">Viewer</span>
        {onlineMatch ? (
          <span className="font-medium text-cyan-200">
            {viewerSeat === "player1" ? "Player 1" : "Player 2"}
          </span>
        ) : (
          <>
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
          </>
        )}
        <span className="text-slate-400">
          Match {match.matchId} - State {projection.stateVersion}
        </span>
      </div>

      {error && (
        <div className="right-4 bottom-4 z-60 fixed bg-red-950 px-3 py-2 border border-red-400/40 rounded text-red-100 text-sm">
          {error}
        </div>
      )}

      <CardSelectionPrompt
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
        decisionKey={`setup:battlefield:${projection.viewerPlayerId}:${battlefieldActions
          .map((action) => action.id)
          .sort()
          .join(",")}`}
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

      <CardSelectionPrompt
        confirmLabel="Choose starting player"
        decisionKey={`setup:starting-player:${projection.viewerPlayerId}:${startingPlayerAction?.id ?? "closed"}`}
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

      <CardSelectionPrompt
        confirmLabel={(selectedIds) =>
          selectedIds.length ? "Mulligan selected" : "Keep opening hand"
        }
        description="Keep your hand or replace up to two cards."
        decisionKey={`setup:mulligan:${projection.viewerPlayerId}:${mulliganAction?.id ?? "closed"}:${mulliganOptions
          .map((option) => option.id)
          .sort()
          .join(",")}`}
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

      <GameBoard
        onPerformAction={(input) => {
          if (!busy) {
            void performAction(input);
          }
        }}
        projection={projection}
      />
      <MatchResultDialog
        busy={busy}
        onCreateMatch={() => {
          if (onlineMatch) {
            window.location.assign("/online");
          } else {
            void createMatch();
          }
        }}
        projection={projection}
      />
    </main>
  );
}

function createOnlineAcceptedMatch(
  credentials: OnlinePlayerCredentials,
): AcceptedMatch {
  const player1 = credentials.player.seat === "player-1"
    ? credentials.player
    : {
        playerId: "player-1",
        seat: "player-1" as const,
        deckId: credentials.player.deckId,
        playerToken: "",
      };
  const player2 = credentials.player.seat === "player-2"
    ? credentials.player
    : {
        playerId: "player-2",
        seat: "player-2" as const,
        deckId: credentials.player.deckId,
        playerToken: "",
      };

  return {
    accepted: true,
    matchId: credentials.matchId,
    gameId: credentials.gameId,
    players: { player1, player2 },
    projections: {},
  };
}

function updateProjection(
  match: AcceptedMatch | null,
  playerId: string,
  projection: NonNullable<AcceptedMatch["projections"][string]>,
): AcceptedMatch | null {
  if (!match) return match;

  const current = match.projections[playerId];
  if (current && current.stateVersion > projection.stateVersion) return match;

  return {
    ...match,
    projections: {
      ...match.projections,
      [playerId]: projection,
    },
  };
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
