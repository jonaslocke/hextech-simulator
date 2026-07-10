import type { DeckId, GameProjection } from "@/shared/game";
import type { AcceptedMatch, ApiFailure, DeckOption } from "./types";

export async function createMatchClient(
  playerDecks: Record<"player1" | "player2", DeckId>,
): Promise<AcceptedMatch | ApiFailure> {
  const response = await fetch("/api/matches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerDecks })
  });
  return response.json() as Promise<AcceptedMatch | ApiFailure>;
}

export async function loadDeckOptionsClient(): Promise<{
  deckOptions: DeckOption[];
}> {
  const response = await fetch("/api/matches");
  if (!response.ok) throw new Error("Unable to load deck options.");
  return response.json() as Promise<{ deckOptions: DeckOption[] }>;
}

export async function loadProjectionClient(matchId: string, playerToken: string): Promise<{ accepted: true; projection: GameProjection } | ApiFailure> {
  const response = await fetch(`/api/matches/${matchId}?playerToken=${encodeURIComponent(playerToken)}`);
  return response.json() as Promise<{ accepted: true; projection: GameProjection } | ApiFailure>;
}

export async function performActionClient(input: {
  matchId: string; playerToken: string; stateVersion: number;
  actionId: string; selectedIds: string[];
  allocations?: Array<{ targetUnitId: string; amount: number }>;
  tokenPlacements?: Array<{ destinationId: string; count: number }>;
}): Promise<{ accepted: true; projection: GameProjection } | ApiFailure> {
  const response = await fetch(`/api/matches/${input.matchId}/intents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      playerToken: input.playerToken,
      stateVersion: input.stateVersion,
      intent: {
        type: "game.performAction",
        payload: {
          actionId: input.actionId,
          selectedIds: input.selectedIds,
          allocations: input.allocations ?? [],
          tokenPlacements: input.tokenPlacements ?? []
        }
      }
    })
  });
  return response.json() as Promise<{ accepted: true; projection: GameProjection } | ApiFailure>;
}
