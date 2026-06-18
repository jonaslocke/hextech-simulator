"use client";

import { useEffect, useState } from "react";
import type { Card as CatalogCard } from "@/server/catalog";
import type { GameLogEntry } from "@/server/events";
import type { GameProjection } from "@/server/match";
import { Button } from "@/shared/components/button";
import { GameBoard } from "@/features/game-board";

type FixedDeckId = "annie" | "lux";
type SeatKey = "player1" | "player2";

type CreatedPlayer = {
  playerId: string;
  seat: "player-1" | "player-2";
  deckId: FixedDeckId;
  playerToken: string;
};

type CreateMatchResponse =
  | {
      accepted: true;
      matchId: string;
      gameId: string;
      gameStatus: string;
      stateVersion: number;
      players: Record<SeatKey, CreatedPlayer>;
      projections: Record<string, GameProjection>;
      cardsByInstanceId: Record<string, CatalogCard>;
      logEntries: Record<string, GameLogEntry[]>;
    }
  | {
      accepted: false;
      error: {
        code: string;
        message: string;
      };
    };

type ViewerStateResponse =
  | {
      accepted: true;
      matchId: string;
      gameId: string;
      projection: GameProjection;
      cardsByInstanceId: Record<string, CatalogCard>;
      logEntries: GameLogEntry[];
    }
  | {
      accepted: false;
      error: {
        code: string;
        message: string;
      };
    };

type IntentResponse =
  | {
      accepted: true;
      projection: GameProjection;
      logEntries: GameLogEntry[];
    }
  | {
      accepted: false;
      error: {
        code: string;
        message: string;
      };
    };

const deckOptions: Array<{ id: FixedDeckId; label: string }> = [
  {
    id: "annie",
    label: "Annie"
  },
  {
    id: "lux",
    label: "Lux"
  }
];

export default function Home() {
  const [playerDecks, setPlayerDecks] = useState<Record<SeatKey, FixedDeckId>>({
    player1: "annie",
    player2: "lux"
  });
  const [viewerSeat, setViewerSeat] = useState<SeatKey>("player1");
  const [match, setMatch] = useState<Extract<CreateMatchResponse, { accepted: true }> | null>(
    null
  );
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
        const response = await fetch(
          `/api/matches/${matchId}?playerToken=${encodeURIComponent(
            viewer.playerToken
          )}`
        );
        const payload = (await response.json()) as ViewerStateResponse;

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
      const response = await fetch("/api/matches", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          playerDecks
        })
      });
      const payload = (await response.json()) as CreateMatchResponse;

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

  async function submitIntent(intent: { type: string; payload?: unknown }) {
    if (!match) {
      return;
    }

    const viewer = match.players[viewerSeat];
    const projection = match.projections[viewer.playerId];

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/matches/${match.matchId}/intents`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          gameId: match.gameId,
          playerToken: viewer.playerToken,
          stateVersion: projection.stateVersion,
          intent
        })
      });
      const payload = (await response.json()) as IntentResponse;

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
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
        <section className="w-full max-w-xl rounded-lg border border-white/10 bg-slate-900 p-5 shadow-xl">
          <div className="mb-5">
            <h1 className="text-xl font-semibold">Riftbound Simulator</h1>
            <p className="mt-1 text-sm text-slate-400">
              Select fixed MVP decks for both seats. Uploads are out of scope for now.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
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
            <p className="mt-4 rounded border border-red-400/40 bg-red-950/60 px-3 py-2 text-sm text-red-100">
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
  const playCardFromHand = ({
    canPlay,
    cardInstanceId,
    selectedModeId
  }: {
    canPlay: boolean;
    cardInstanceId: string;
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
        selectedModeId,
        destination: "base"
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

  return (
    <main className="relative min-h-screen bg-slate-950">
      <div className="absolute left-14 top-2 z-50 flex items-center gap-2 rounded bg-slate-950/90 px-2 py-1 text-xs text-slate-100 shadow">
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
      <GameActionPanel
        cardsByInstanceId={match.cardsByInstanceId}
        disabled={isSubmitting}
        error={error}
        onIntent={submitIntent}
        projection={projection}
        viewer={viewer}
      />
      <GameBoard
        cardsByInstanceId={match.cardsByInstanceId}
        logEntries={match.logEntries[viewer.playerId] ?? []}
        onAddRuneResource={addRuneResourceFromBoard}
        onPlayCard={playCardFromHand}
        projection={projection}
      />
    </main>
  );
}

function GameActionPanel({
  cardsByInstanceId,
  disabled,
  error,
  onIntent,
  projection,
  viewer
}: {
  cardsByInstanceId: Record<string, CatalogCard>;
  disabled: boolean;
  error: string | null;
  onIntent: (intent: { type: string; payload?: unknown }) => void;
  projection: GameProjection;
  viewer: CreatedPlayer;
}) {
  const viewerState = projection.players[viewer.playerId];

  if (!viewerState) {
    return null;
  }

  return (
    <aside className="absolute right-14 top-2 z-50 w-80 rounded border border-white/10 bg-slate-950/90 p-3 text-xs text-slate-100 shadow-xl">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-semibold">Actions</span>
        <span className="text-slate-400">{projection.status}</span>
      </div>
      {projection.turn && (
        <div className="mb-3 rounded border border-white/10 bg-slate-900/80 px-2 py-1 text-slate-300">
          <div>
            Turn {projection.turn.turnNumber} - {projection.turn.phase} - active{" "}
            {projection.turn.activePlayerId}
          </div>
          {projection.turn.completedStartOfTurnSteps.length > 0 && (
            <div className="mt-1 text-slate-500">
              Start: {projection.turn.completedStartOfTurnSteps.join(" -> ")}
            </div>
          )}
        </div>
      )}
      {projection.status === "setup_pending" ? (
        <SetupControls
          cardsByInstanceId={cardsByInstanceId}
          disabled={disabled}
          onIntent={onIntent}
          projection={projection}
          viewerId={viewer.playerId}
        />
      ) : (
        <GameplayControls
          cardsByInstanceId={cardsByInstanceId}
          disabled={disabled}
          onIntent={onIntent}
          projection={projection}
          viewerId={viewer.playerId}
          viewerState={viewerState}
        />
      )}
      {error && (
        <p className="mt-3 rounded border border-red-400/40 bg-red-950/70 px-2 py-1 text-red-100">
          {error}
        </p>
      )}
    </aside>
  );
}

function SetupControls({
  cardsByInstanceId,
  disabled,
  onIntent,
  projection,
  viewerId
}: {
  cardsByInstanceId: Record<string, CatalogCard>;
  disabled: boolean;
  onIntent: (intent: { type: string; payload?: unknown }) => void;
  projection: GameProjection;
  viewerId: string;
}) {
  const playerIds = projection.setup.playerIds;
  const viewerChoice = projection.setup.battlefieldChoices[viewerId];
  const viewerBattlefieldPool = projection.setup.battlefieldPools[viewerId];

  return (
    <div className="grid gap-3">
      <div className="grid gap-2">
        <span className="font-medium text-slate-300">Starting player</span>
        {projection.setup.startingPlayerId ? (
          <span className="text-slate-400">
            Selected: {projection.setup.startingPlayerId}
          </span>
        ) : projection.setup.startingPlayerChooserId === viewerId ? (
          <div className="flex gap-2">
            {playerIds.map((playerId) => (
              <Button
                key={playerId}
                disabled={disabled}
                onClick={() =>
                  onIntent({
                    type: "setup.chooseStartingPlayer",
                    payload: {
                      startingPlayerId: playerId
                    }
                  })
                }
                size="sm"
                type="button"
              >
                {playerId}
              </Button>
            ))}
          </div>
        ) : (
          <span className="text-slate-400">
            Waiting for {projection.setup.startingPlayerChooserId ?? "chooser"}.
          </span>
        )}
      </div>
      <div className="grid gap-2">
        <span className="font-medium text-slate-300">Battlefield</span>
        {viewerChoice?.status === "revealed" || viewerChoice?.status === "locked" ? (
          <span className="text-slate-400">Choice {viewerChoice.status}.</span>
        ) : (
          <div className="grid gap-2">
            {viewerBattlefieldPool?.registeredCardInstanceIds.map((cardInstanceId) => (
              <Button
                key={cardInstanceId}
                disabled={disabled}
                onClick={() =>
                  onIntent({
                    type: "setup.lockBattlefieldChoice",
                    payload: {
                      cardInstanceId
                    }
                  })
                }
                size="sm"
                type="button"
                variant="secondary"
              >
                {cardsByInstanceId[cardInstanceId]?.name ?? "Battlefield"}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function GameplayControls({
  cardsByInstanceId,
  disabled,
  onIntent,
  projection,
  viewerId,
  viewerState
}: {
  cardsByInstanceId: Record<string, CatalogCard>;
  disabled: boolean;
  onIntent: (intent: { type: string; payload?: unknown }) => void;
  projection: GameProjection;
  viewerId: string;
  viewerState: GameProjection["players"][string];
}) {
  const baseRunes = viewerState.zones.base.cardInstanceIds.filter((cardInstanceId) => {
    const card = cardsByInstanceId[cardInstanceId];

    return card?.classification.type === "Rune";
  });
  const playableCards = Object.entries(viewerState.availablePaymentModes);

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-2">
        <Button
          disabled={disabled}
          onClick={() => onIntent({ type: "game.channel" })}
          size="sm"
          type="button"
        >
          Channel 1
        </Button>
        <Button
          disabled={disabled}
          onClick={() => onIntent({ type: "game.draw" })}
          size="sm"
          type="button"
        >
          Draw 1
        </Button>
        <Button
          disabled={disabled}
          onClick={() => onIntent({ type: "game.pass" })}
          size="sm"
          type="button"
          variant="secondary"
        >
          Pass
        </Button>
        <Button
          disabled={disabled || projection.turn?.activePlayerId !== viewerId}
          onClick={() => onIntent({ type: "game.endTurn" })}
          size="sm"
          type="button"
          variant="secondary"
        >
          End turn
        </Button>
      </div>
      <div className="grid gap-2">
        <span className="font-medium text-slate-300">
          Rune pool: {viewerState.runePool.energy} energy
        </span>
        <div className="grid max-h-28 gap-1 overflow-auto">
          {baseRunes.map((cardInstanceId) => {
            const isExhausted =
              projection.cardStates[cardInstanceId]?.exhausted === true;

            return (
            <div key={cardInstanceId} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-slate-400">
                {cardsByInstanceId[cardInstanceId]?.name ?? "Rune"}
              </span>
              <Button
                disabled={disabled || isExhausted}
                onClick={() =>
                  onIntent({
                    type: "game.addRuneResource",
                    payload: {
                      runeCardInstanceId: cardInstanceId,
                      resourceType: "energy"
                    }
                  })
                }
                size="sm"
                type="button"
                variant="secondary"
              >
                Energy
              </Button>
              <Button
                disabled={disabled}
                onClick={() =>
                  onIntent({
                    type: "game.addRuneResource",
                    payload: {
                      runeCardInstanceId: cardInstanceId,
                      resourceType: "power"
                    }
                  })
                }
                size="sm"
                type="button"
                variant="secondary"
              >
                Power
              </Button>
            </div>
          );
          })}
          {baseRunes.length === 0 && (
            <span className="text-slate-500">No runes in base.</span>
          )}
        </div>
      </div>
      <div className="grid gap-2">
        <span className="font-medium text-slate-300">Playable cards</span>
        <div className="grid max-h-32 gap-1 overflow-auto">
          {playableCards.map(([cardInstanceId, modes]) => (
            <Button
              key={cardInstanceId}
              disabled={disabled || modes.length === 0}
              onClick={() =>
                onIntent({
                  type: "game.playCard",
                  payload: {
                    cardInstanceId,
                    selectedModeId: modes[0]?.id,
                    destination: "base"
                  }
                })
              }
              size="sm"
              type="button"
              variant="secondary"
            >
              {cardsByInstanceId[cardInstanceId]?.name ?? "Card"}
            </Button>
          ))}
          {playableCards.length === 0 && (
            <span className="text-slate-500">No supported card can be paid now.</span>
          )}
        </div>
      </div>
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
    <label className="grid gap-2 text-sm">
      <span className="font-medium text-slate-300">{label}</span>
      <select
        className="rounded border border-white/10 bg-slate-950 px-3 py-2 text-slate-100"
        value={value}
        onChange={(event) => onChange(event.target.value as FixedDeckId)}
      >
        {deckOptions.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
