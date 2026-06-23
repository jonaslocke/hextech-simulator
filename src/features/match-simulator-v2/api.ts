import type { GameProjectionV2 } from "@/shared/game-v2";
import type { AcceptedMatchV2, ApiFailureV2 } from "./types";

export async function createMatchV2Client(): Promise<AcceptedMatchV2 | ApiFailureV2> {
  const response = await fetch("/api/v2/matches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerDecks: { player1: "lux", player2: "lux" } })
  });
  return response.json() as Promise<AcceptedMatchV2 | ApiFailureV2>;
}

export async function loadProjectionV2Client(matchId: string, playerToken: string): Promise<{ accepted: true; projection: GameProjectionV2 } | ApiFailureV2> {
  const response = await fetch(`/api/v2/matches/${matchId}?playerToken=${encodeURIComponent(playerToken)}`);
  return response.json() as Promise<{ accepted: true; projection: GameProjectionV2 } | ApiFailureV2>;
}

export async function performActionV2Client(input: {
  matchId: string; playerToken: string; stateVersion: number;
  actionId: string; selectedIds: string[];
}): Promise<{ accepted: true; projection: GameProjectionV2 } | ApiFailureV2> {
  const response = await fetch(`/api/v2/matches/${input.matchId}/intents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      playerToken: input.playerToken,
      stateVersion: input.stateVersion,
      intent: { type: "game.performAction", payload: { actionId: input.actionId, selectedIds: input.selectedIds } }
    })
  });
  return response.json() as Promise<{ accepted: true; projection: GameProjectionV2 } | ApiFailureV2>;
}

