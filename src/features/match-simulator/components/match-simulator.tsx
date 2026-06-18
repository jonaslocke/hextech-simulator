"use client";

import { useEffect, useState } from "react";
import { Button } from "@/shared/components/button";
import { ChoiceDialog } from "@/shared/components/choice-dialog";
import { GameBoard } from "@/features/game-board";
import {
  createFixedDeckMatch,
  getViewerState,
  submitMatchIntent
} from "../api";
import { DECK_OPTIONS } from "../constants";
import type {
  AcceptedMatch,
  FixedDeckId,
  GameProjection,
  MatchIntent,
  SeatKey
} from "../types";

export function MatchSimulator() {
  const [playerDecks, setPlayerDecks] = useState<Record<SeatKey, FixedDeckId>>({
    player1: "annie",
    player2: "lux"
  });
  const [viewerSeat, setViewerSeat] = useState<SeatKey>("player1");
  const [match, setMatch] = useState<AcceptedMatch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const currentMatchId = match?.matchId;
  const currentViewer = match?.players[viewerSeat];

  useEffect(() => {
    if (!currentMatchId || !currentViewer) {
      return;
    }

    let isActive = true;
    const matchId = currentMatchId;
    const viewer = currentViewer;

    async function refreshViewerState() {
      try {
        const payload = await getViewerState({
          matchId,
          playerToken: viewer.playerToken
        });

        if (!isActive || !payload.accepted) {
          return;
        }

        setMatch((current) =>
          current
            ? {
                ...current,
                cardsByInstanceId: payload.cardsByInstanceId,
                logEntries: {
                  ...current.logEntries,
                  [viewer.playerId]: payload.logEntries
                },
                projections: {
                  ...current.projections,
                  [viewer.playerId]: payload.projection
                },
                stateVersion: payload.projection.stateVersion
              }
            : current
        );
      } catch {
        if (isActive) {
          setError("Unable to refresh viewer state.");
        }
      }
    }

    void refreshViewerState();

    return () => {
      isActive = false;
    };
  }, [currentMatchId, currentViewer]);

  async function createMatch() {
    setIsCreating(true);
    setError(null);

    try {
      const payload = await createFixedDeckMatch(playerDecks);

      if (!payload.accepted) {
        setError(payload.error.message);
        return;
      }

      setMatch(payload);
      setViewerSeat("player1");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create match.");
    } finally {
      setIsCreating(false);
    }
  }

  async function submitIntent(intent: MatchIntent) {
    if (!match) {
      return;
    }

    const viewer = match.players[viewerSeat];
    const projection = match.projections[viewer.playerId];

    setIsSubmitting(true);
    setError(null);

    try {
      const payload = await submitMatchIntent({
        gameId: match.gameId,
        intent,
        matchId: match.matchId,
        playerToken: viewer.playerToken,
        stateVersion: projection.stateVersion
      });

      if (!payload.accepted) {
        setError(payload.error.message);
        return;
      }

      setMatch((current) =>
        current
          ? {
              ...current,
              gameStatus: payload.projection.status,
              logEntries: {
                ...current.logEntries,
                [viewer.playerId]: [
                  ...(current.logEntries[viewer.playerId] ?? []),
                  ...payload.logEntries
                ]
              },
              projections: {
                ...current.projections,
                [viewer.playerId]: payload.projection
              },
              stateVersion: payload.projection.stateVersion
            }
          : current
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Intent request failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!match) {
    return (
      <main className="flex justify-center items-center bg-slate-950 p-6 min-h-screen text-slate-100">
        <section className="bg-slate-900 shadow-xl p-5 border border-white/10 rounded-lg w-full max-w-xl">
          <div className="mb-5">
            <h1 className="font-semibold text-xl">Riftbound Simulator</h1>
            <p className="mt-1 text-slate-400 text-sm">
              Select fixed MVP decks for both seats. Uploads are out of scope for now.
            </p>
          </div>
          <div className="gap-4 grid sm:grid-cols-2">
            <DeckSelect
              label="Player 1 deck"
              value={playerDecks.player1}
              onChange={(deckId) =>
                setPlayerDecks((current) => ({
                  ...current,
                  player1: deckId
                }))
              }
            />
            <DeckSelect
              label="Player 2 deck"
              value={playerDecks.player2}
              onChange={(deckId) =>
                setPlayerDecks((current) => ({
                  ...current,
                  player2: deckId
                }))
              }
            />
          </div>
          {error && (
            <p className="bg-red-950/60 mt-4 px-3 py-2 border border-red-400/40 rounded text-red-100 text-sm">
              {error}
            </p>
          )}
          <Button
            className="mt-5 w-full"
            disabled={isCreating}
            onClick={createMatch}
            type="button"
          >
            {isCreating ? "Creating match..." : "Create match"}
          </Button>
        </section>
      </main>
    );
  }

  const viewer = match.players[viewerSeat];
  const projection = match.projections[viewer.playerId];
  const startingPlayerChoiceOpen =
    projection.status === "setup_pending" &&
    projection.setup.startingPlayerId === null &&
    projection.setup.startingPlayerChooserId === viewer.playerId;
  const startingPlayerOptions = projection.setup.playerIds.map((playerId) => ({
    description:
      playerId === viewer.playerId
        ? "You take the first turn."
        : "Your opponent takes the first turn.",
    id: playerId,
    label: playerLabel(match, playerId)
  }));
  const viewerBattlefieldChoice =
    projection.setup.battlefieldChoices[viewer.playerId];
  const viewerBattlefieldPool =
    projection.setup.battlefieldPools[viewer.playerId];
  const battlefieldChoiceOpen =
    !startingPlayerChoiceOpen &&
    projection.status === "setup_pending" &&
    viewerBattlefieldChoice?.status === "unlocked" &&
    (viewerBattlefieldPool?.registeredCardInstanceIds.length ?? 0) > 0;
  const battlefieldOptions =
    viewerBattlefieldPool?.registeredCardInstanceIds.map((cardInstanceId) => {
      const card = match.cardsByInstanceId[cardInstanceId];

      return {
        description: card?.text.plain || card?.set.label,
        id: cardInstanceId,
        imageUrl: card?.media.image_url,
        label: card?.name ?? "Battlefield"
      };
    }) ?? [];
  const playCardFromHand = ({
    canPlay,
    cardInstanceId,
    choices,
    selectedModeId
  }: {
    canPlay: boolean;
    cardInstanceId: string;
    choices?: {
      targetCardInstanceIds?: string[];
    };
    selectedModeId?: string;
  }) => {
    if (!canPlay) {
      setError("This card is not currently playable.");
      return;
    }

    void submitIntent({
      type: "game.playCard",
      payload: {
        cardInstanceId,
        choices,
        selectedModeId,
        destination: "base"
      }
    });
  };
  const activateAbility = ({
    abilityId,
    sourceCardInstanceId
  }: {
    abilityId: string;
    sourceCardInstanceId: string;
  }) => {
    void submitIntent({
      type: "game.activateAbility",
      payload: {
        abilityId,
        sourceCardInstanceId
      }
    });
  };
  const submitChoice = ({
    choiceId,
    orderedIds
  }: {
    choiceId: string;
    orderedIds: string[];
  }) => {
    void submitIntent({
      type: "game.submitChoice",
      payload: {
        choiceId,
        orderedIds
      }
    });
  };
  const addRuneResourceFromBoard = ({
    cardInstanceId,
    resourceType
  }: {
    cardInstanceId: string;
    resourceType: "energy" | "power";
  }) => {
    void submitIntent({
      type: "game.addRuneResource",
      payload: {
        runeCardInstanceId: cardInstanceId,
        resourceType
      }
    });
  };
  const passPriority = () => {
    void submitIntent({
      type: "game.pass"
    });
  };
  const endTurn = () => {
    if (projection.chain) {
      setError("Resolve the chain before passing the turn.");
      return;
    }

    void submitIntent({
      type: "game.endTurn"
    });
  };

  return (
    <main className="relative bg-slate-950 min-h-screen">
      <div className="top-2 left-14 z-50 absolute flex items-center gap-2 bg-slate-950/90 shadow px-2 py-1 rounded text-slate-100 text-xs">
        <span className="text-slate-400">Viewer</span>
        <Button
          size="sm"
          variant={viewerSeat === "player1" ? "default" : "secondary"}
          onClick={() => setViewerSeat("player1")}
          type="button"
        >
          Player 1
        </Button>
        <Button
          size="sm"
          variant={viewerSeat === "player2" ? "default" : "secondary"}
          onClick={() => setViewerSeat("player2")}
          type="button"
        >
          Player 2
        </Button>
        <span className="text-slate-400">
          Match {match.matchId} - State {projection.stateVersion}
        </span>
      </div>
      {error && <ErrorToast message={error} onClose={() => setError(null)} />}
      <ChoiceDialog
        confirmLabel="Choose starting player"
        description="The selected player will take the first turn of this game."
        isOpen={startingPlayerChoiceOpen}
        onConfirm={([startingPlayerId]) => {
          if (!startingPlayerId) {
            return;
          }

          void submitIntent({
            type: "setup.chooseStartingPlayer",
            payload: {
              startingPlayerId
            }
          });
        }}
        options={startingPlayerOptions}
        selectionMode="single"
        title="Choose Starting Player"
      />
      <ChoiceDialog
        confirmLabel="Lock battlefield"
        description="This battlefield will be revealed after both players lock their choices."
        isOpen={battlefieldChoiceOpen}
        onConfirm={([cardInstanceId]) => {
          if (!cardInstanceId) {
            return;
          }

          void submitIntent({
            type: "setup.lockBattlefieldChoice",
            payload: {
              cardInstanceId
            }
          });
        }}
        options={battlefieldOptions}
        selectionMode="single"
        title="Choose Battlefield"
      />
      <GameBoard
        cardsByInstanceId={match.cardsByInstanceId}
        logEntries={match.logEntries[viewer.playerId] ?? []}
        onActivateAbility={activateAbility}
        onAddRuneResource={addRuneResourceFromBoard}
        onEndTurn={endTurn}
        onPass={passPriority}
        onPlayCard={playCardFromHand}
        onSubmitChoice={submitChoice}
        projection={projection}
      />
    </main>
  );
}

function playerLabel(match: AcceptedMatch, playerId: string) {
  if (match.players.player1.playerId === playerId) {
    return "Player 1";
  }

  if (match.players.player2.playerId === playerId) {
    return "Player 2";
  }

  return playerId;
}

function ErrorToast({
  message,
  onClose
}: {
  message: string;
  onClose: () => void;
}) {
  return (
    <div className="right-16 bottom-5 z-50 fixed flex items-center gap-3 bg-red-950/90 shadow-xl px-3 py-2 border border-red-400/50 rounded-md text-red-100 text-sm">
      <span>{message}</span>
      <button
        className="text-red-200 hover:text-white"
        onClick={onClose}
        type="button"
      >
        Close
      </button>
    </div>
  );
}

function DeckSelect({
  label,
  onChange,
  value
}: {
  label: string;
  onChange: (deckId: FixedDeckId) => void;
  value: FixedDeckId;
}) {
  return (
    <label className="gap-2 grid text-sm">
      <span className="font-medium text-slate-300">{label}</span>
      <select
        className="bg-slate-950 px-3 py-2 border border-white/10 rounded text-slate-100"
        value={value}
        onChange={(event) => onChange(event.target.value as FixedDeckId)}
      >
        {DECK_OPTIONS.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
