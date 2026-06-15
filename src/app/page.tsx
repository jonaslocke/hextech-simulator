"use client";

import { useState } from "react";
import type { Card as CatalogCard } from "@/server/catalog";
import type { GameLogEntry } from "@/server/events";
import type { GameProjection } from "@/server/match";
import { Button } from "@/components/ui/button";
import { GameBoard } from "../../features/game-board";

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
      <GameBoard
        cardsByInstanceId={match.cardsByInstanceId}
        logEntries={match.logEntries[viewer.playerId] ?? []}
        projection={projection}
      />
    </main>
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
