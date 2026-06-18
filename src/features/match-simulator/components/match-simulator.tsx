"use client";

import { useEffect, useState } from "react";
import { Button } from "@/shared/components/button";
import { GameBoard } from "@/features/game-board";
import {
  createFixedDeckMatch,
  getViewerState,
  submitMatchIntent
} from "../api";
import { DECK_OPTIONS } from "../constants";
import type {
  AcceptedMatch,
  CatalogCard,
  CreatedPlayer,
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
        onActivateAbility={activateAbility}
        onAddRuneResource={addRuneResourceFromBoard}
        onPass={passPriority}
        onPlayCard={playCardFromHand}
        onSubmitChoice={submitChoice}
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
  onIntent: (intent: MatchIntent) => void;
  projection: GameProjection;
  viewer: CreatedPlayer;
}) {
  const viewerState = projection.players[viewer.playerId];

  if (!viewerState) {
    return null;
  }

  return (
    <aside className="top-10 z-50 absolute bg-slate-950/90 shadow-xl p-3 border border-white/10 rounded w-80 text-slate-100 text-xs">
      <div className="flex justify-between items-center gap-2 mb-2">
        <span className="font-semibold">Actions</span>
        <span className="text-slate-400">{projection.status}</span>
      </div>
      {projection.turn && (
        <div className="bg-slate-900/80 mb-3 px-2 py-1 border border-white/10 rounded text-slate-300">
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
        <p className="bg-red-950/70 mt-3 px-2 py-1 border border-red-400/40 rounded text-red-100">
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
  onIntent: (intent: MatchIntent) => void;
  projection: GameProjection;
  viewerId: string;
}) {
  const playerIds = projection.setup.playerIds;
  const viewerChoice = projection.setup.battlefieldChoices[viewerId];
  const viewerBattlefieldPool = projection.setup.battlefieldPools[viewerId];

  return (
    <div className="gap-3 grid">
      <div className="gap-2 grid">
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
      <div className="gap-2 grid">
        <span className="font-medium text-slate-300">Battlefield</span>
        {viewerChoice?.status === "revealed" || viewerChoice?.status === "locked" ? (
          <span className="text-slate-400">Choice {viewerChoice.status}.</span>
        ) : (
          <div className="gap-2 grid">
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
  onIntent: (intent: MatchIntent) => void;
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
    <div className="gap-3 grid">
      <div className="gap-2 grid grid-cols-2">
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
      <div className="gap-2 grid">
        <span className="font-medium text-slate-300">
          Rune pool: {viewerState.runePool.energy} energy
        </span>
        <div className="gap-1 grid max-h-28 overflow-auto">
          {baseRunes.map((cardInstanceId) => {
            const isExhausted =
              projection.cardStates[cardInstanceId]?.exhausted === true;

            return (
            <div key={cardInstanceId} className="flex items-center gap-2">
              <span className="flex-1 min-w-0 text-slate-400 truncate">
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
      <div className="gap-2 grid">
        <span className="font-medium text-slate-300">Playable cards</span>
        <div className="gap-1 grid max-h-32 overflow-auto">
          {playableCards.map(([cardInstanceId, modes]) => (
            <PlayableCardButton
              card={cardsByInstanceId[cardInstanceId]}
              cardInstanceId={cardInstanceId}
              disabled={disabled || modes.length === 0}
              key={cardInstanceId}
              onIntent={onIntent}
              selectedModeId={modes[0]?.id}
            />
          ))}
          {playableCards.length === 0 && (
            <span className="text-slate-500">No supported card can be paid now.</span>
          )}
        </div>
      </div>
    </div>
  );
}

function PlayableCardButton({
  card,
  cardInstanceId,
  disabled,
  onIntent,
  selectedModeId
}: {
  card: CatalogCard | undefined;
  cardInstanceId: string;
  disabled: boolean;
  onIntent: (intent: MatchIntent) => void;
  selectedModeId: string | undefined;
}) {
  const requiresBoardTargets =
    card !== undefined && cardRequiresBoardTargets(card.name);

  return (
    <Button
      disabled={disabled || requiresBoardTargets}
      onClick={() =>
        onIntent({
          type: "game.playCard",
          payload: {
            cardInstanceId,
            selectedModeId,
            destination: "base"
          }
        })
      }
      size="sm"
      title={
        requiresBoardTargets
          ? "Use the card in hand and choose targets on the board."
          : undefined
      }
      type="button"
      variant="secondary"
    >
      {card?.name ?? "Card"}
      {requiresBoardTargets ? " (choose on board)" : ""}
    </Button>
  );
}

function cardRequiresBoardTargets(name: string) {
  return [
    "Back to Back",
    "Blast of Power",
    "Falling Comet",
    "Final Spark",
    "Singularity",
    "Stupefy"
  ].includes(name);
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
