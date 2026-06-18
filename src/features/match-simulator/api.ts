import type {
  CreateMatchResponse,
  FixedDeckId,
  IntentResponse,
  MatchIntent,
  SeatKey,
  ViewerStateResponse
} from "./types";

export async function createFixedDeckMatch(
  playerDecks: Record<SeatKey, FixedDeckId>
): Promise<CreateMatchResponse> {
  const response = await fetch("/api/matches", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      playerDecks
    })
  });

  return (await response.json()) as CreateMatchResponse;
}

export async function getViewerState({
  matchId,
  playerToken
}: {
  matchId: string;
  playerToken: string;
}): Promise<ViewerStateResponse> {
  const response = await fetch(
    `/api/matches/${matchId}?playerToken=${encodeURIComponent(playerToken)}`
  );

  return (await response.json()) as ViewerStateResponse;
}

export async function submitMatchIntent({
  gameId,
  intent,
  matchId,
  playerToken,
  stateVersion
}: {
  gameId: string;
  intent: MatchIntent;
  matchId: string;
  playerToken: string;
  stateVersion: number;
}): Promise<IntentResponse> {
  const response = await fetch(`/api/matches/${matchId}/intents`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      gameId,
      playerToken,
      stateVersion,
      intent
    })
  });

  return (await response.json()) as IntentResponse;
}
