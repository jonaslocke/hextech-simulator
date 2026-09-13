import {
  advanceGameObjectIncarnation,
  createRuntimeCardIndex,
  type RuntimeCardIndex,
} from "./primitive-handlers";
import type { DeckSnapshotDocument } from "./repositories";
import { applyHoldScoring } from "./scoring";
import type { GameDocument } from "./state";
import { queueBeginningPhaseTriggers } from "./triggers";

type StartOfTurnPhase = "awaken" | "beginning" | "channel" | "draw";

export function isStartOfTurnPhase(
  phase: NonNullable<GameDocument["state"]["turn"]>["phase"] | undefined,
): phase is StartOfTurnPhase {
  return (
    phase === "awaken" ||
    phase === "beginning" ||
    phase === "channel" ||
    phase === "draw"
  );
}

export function applyStartOfTurn(
  game: GameDocument,
  decks: readonly DeckSnapshotDocument[] = [],
  runtimeIndex?: RuntimeCardIndex,
) {
  const turn = game.state.turn;
  if (!turn)
    throw new Error("A turn is required to apply start-of-turn steps.");
  const player = game.state.players[turn.activePlayerId]!;
  const index =
    runtimeIndex ?? (decks.length ? createRuntimeCardIndex(decks, game) : null);

  while (
    game.status === "in_progress" &&
    !game.state.chain &&
    !game.state.pendingChoice
  ) {
    if (turn.phase === "awaken") {
      game.state.facedownVisibilityGrants = (
        game.state.facedownVisibilityGrants ?? []
      ).filter((grant) => grant.expiresAtTurnNumber >= turn.turnNumber);
      for (const candidate of Object.values(game.state.players)) {
        candidate.energy = 0;
        candidate.power = {};
        candidate.conditionalEnergy = 0;
        candidate.restrictedResources = { energy: {}, power: {} };
      }
      player.scoredBattlefieldIdsThisTurn = [];
      const controlledBattlefieldCards = game.state.battlefields
        .flatMap((battlefield) => [
          ...battlefield.units,
          ...(battlefield.attachedCardInstanceIds ?? []),
        ])
        .filter(
          (cardId) =>
            index?.instances.get(cardId)?.ownerPlayerId ===
            turn.activePlayerId,
        );
      for (const cardId of [
        ...(player.zones.legend ? [player.zones.legend] : []),
        ...player.zones.base,
        ...controlledBattlefieldCards,
      ]) {
        if (game.state.cardStates[cardId]) {
          game.state.cardStates[cardId]!.exhausted = false;
        }
      }
      turn.phase = "beginning";
      continue;
    }

    if (turn.phase === "beginning") {
      if (!turn.beginningTriggersQueued) {
        turn.beginningTriggersQueued = true;
        if (decks.length && queueBeginningPhaseTriggers(game, decks)) {
          return;
        }
      }
      // All beginning triggers, including Temporary, have resolved before
      // Hold scoring reaches this checkpoint.
      turn.phase = "channel";
      if (decks.length) {
        applyHoldScoring(game, turn.activePlayerId, decks);
      }
      continue;
    }

    if (turn.phase === "channel") {
      const isNonStartingPlayersFirstTurn =
        turn.turnNumber === 2 &&
        turn.activePlayerId !== game.state.setup.startingPlayerId;
      draw(
        game,
        player.zones.runeDeck,
        player.zones.base,
        isNonStartingPlayersFirstTurn ? 3 : 2,
      );
      turn.phase = "draw";
      continue;
    }

    if (turn.phase === "draw") {
      draw(game, player.zones.mainDeck, player.zones.hand, 1);
      turn.phase = "action";
    }
    return;
  }
}

function draw(
  game: GameDocument,
  source: string[],
  destination: string[],
  count: number,
) {
  const drawn = source.splice(0, Math.min(count, source.length));
  destination.push(...drawn);
  drawn.forEach((id) => advanceGameObjectIncarnation(game, id));
}
