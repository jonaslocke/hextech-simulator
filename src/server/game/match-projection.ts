import { matchProjectionSchema, type MatchProjection } from "@/shared/game";
import { BO3_MATCH_FEATURES } from "./bo3-match-config";
import {
  deriveRemainingBattlefieldRegisteredIdsByPlayerId,
  deriveScoreByPlayerId,
  deriveUsedBattlefieldRegisteredIdsByPlayerId,
} from "./match-derivations";
import { projectGame } from "./projection";
import type { DeckSnapshotDocument, GameEventDocument } from "./repositories";
import type { GameDocument, MatchDocument } from "./state";

export function projectMatch(input: {
  match: MatchDocument;
  currentGame: GameDocument;
  viewerPlayerId: string;
  decks: DeckSnapshotDocument[];
  events?: GameEventDocument[];
}): MatchProjection {
  const viewerSeat = input.match.seats.find(
    (seat) => seat.playerId === input.viewerPlayerId,
  );
  const opponentSeat = input.match.seats.find(
    (seat) => seat.playerId !== input.viewerPlayerId,
  );
  if (!viewerSeat || !opponentSeat) {
    throw new Error("Viewer is not seated in this match.");
  }

  const usedBattlefields =
    deriveUsedBattlefieldRegisteredIdsByPlayerId(input.match);
  const remainingBattlefields =
    deriveRemainingBattlefieldRegisteredIdsByPlayerId(input.match, input.decks);
  const currentGame = projectGame({
    game: input.currentGame,
    viewerPlayerId: input.viewerPlayerId,
    decks: input.decks,
    events: input.events,
    playerNames: playerNamesFromMatch(input.match),
  });

  return matchProjectionSchema.parse({
    matchId: input.match.id,
    stateVersion: input.match.stateVersion,
    format: input.match.format,
    status: input.match.status,
    viewerPlayerId: input.viewerPlayerId,
    scoreByPlayerId: deriveScoreByPlayerId(input.match),
    winnerPlayerId: input.match.completion?.winnerPlayerId ?? null,
    completionReason: input.match.completion?.reason ?? null,
    currentGameId: input.match.currentGameId,
    gameNumber: input.currentGame.gameNumber,
    gameIds: input.match.gameIds,
    completedGames: input.match.completedGames.map((game) => ({
      gameId: game.gameId,
      gameNumber: game.gameNumber,
      winnerPlayerId: game.winnerPlayerId,
      completionReason: game.completionReason,
    })),
    currentGame,
    betweenGames: input.match.betweenGames
      ? {
          id: input.match.betweenGames.id,
          mode: "ready_with_current_configuration",
          nextGameNumber: input.match.betweenGames.nextGameNumber,
          previousGameWinnerPlayerId:
            input.match.betweenGames.previousGameWinnerPlayerId,
          previousGameLoserPlayerId:
            input.match.betweenGames.previousGameLoserPlayerId,
          nextStartingPlayerChooserId:
            input.match.betweenGames.nextStartingPlayerChooserId,
          viewerStatus:
            input.match.betweenGames.submissionsByPlayerId[
              input.viewerPlayerId
            ]?.status ?? "pending",
          opponentStatus:
            input.match.betweenGames.submissionsByPlayerId[
              opponentSeat.playerId
            ]?.status ?? "pending",
          usedBattlefieldRegisteredIdsByPlayerId: usedBattlefields,
          remainingBattlefieldRegisteredIdsByPlayerId: remainingBattlefields,
          nextBattlefieldMode:
            input.match.betweenGames.nextGameNumber === 3
              ? "server_auto"
              : "player_choice",
          viewerCurrentDeckConfiguration:
            viewerSeat.currentDeckConfiguration,
          capabilities: {
            canReadyWithCurrentConfiguration:
              BO3_MATCH_FEATURES.readyWithCurrentDeckConfiguration &&
              input.match.status === "between_games" &&
              (input.match.betweenGames.submissionsByPlayerId[
                input.viewerPlayerId
              ]?.status ?? "pending") === "pending",
            canSubmitDeckReconfiguration: false,
            canConcedeMatch: input.match.status === "between_games",
          },
        }
      : null,
  });
}

function playerNamesFromMatch(match: MatchDocument): Record<string, string> {
  return Object.fromEntries(
    match.seats.map((seat) => [
      seat.playerId,
      seat.displayName || seat.playerId,
    ]),
  );
}
