import type { GameProjection } from "@/shared/game";
import type { AcceptedMatch, ApiFailure } from "./types";

export async function createMatchClient(): Promise<AcceptedMatch | ApiFailure> {
  const response = await fetch("/api/matches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerDecks: { player1: "lux", player2: "lux" } })
  });
  return response.json() as Promise<AcceptedMatch | ApiFailure>;
}

export async function loadProjectionClient(matchId: string, playerToken: string): Promise<{ accepted: true; projection: GameProjection } | ApiFailure> {
  const response = await fetch(`/api/matches/${matchId}?playerToken=${encodeURIComponent(playerToken)}`);
  return response.json() as Promise<{ accepted: true; projection: GameProjection } | ApiFailure>;
}

export async function performActionClient(input: {
  matchId: string; playerToken: string; stateVersion: number;
  actionId: string; selectedIds: string[];
}): Promise<{ accepted: true; projection: GameProjection } | ApiFailure> {
  const response = await fetch(`/api/matches/${input.matchId}/intents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      playerToken: input.playerToken,
      stateVersion: input.stateVersion,
      intent: { type: "game.performAction", payload: { actionId: input.actionId, selectedIds: input.selectedIds } }
    })
  });
  return response.json() as Promise<{ accepted: true; projection: GameProjection } | ApiFailure>;
}
