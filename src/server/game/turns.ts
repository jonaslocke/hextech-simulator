import {
  createRuntimeCardIndex,
  type RuntimeCardIndex,
} from "./primitive-handlers";
import type { DeckSnapshotDocument } from "./repositories";
import { applyHoldScoring } from "./scoring";
import type { GameDocument } from "./state";

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
    runtimeIndex ?? (decks.length ? createRuntimeCardIndex(decks) : null);

  while (
    game.status === "in_progress" &&
    !game.state.chain &&
    !game.state.pendingChoice
  ) {
    if (turn.phase === "awaken") {
      for (const candidate of Object.values(game.state.players)) {
        candidate.energy = 0;
        candidate.power = {};
        candidate.conditionalEnergy = 0;
      }
      player.scoredBattlefieldIdsThisTurn = [];
      const controlledBattlefieldUnits = game.state.battlefields
        .flatMap((battlefield) => battlefield.units)
        .filter(
          (cardId) =>
            index?.instances.get(cardId)?.ownerPlayerId ===
            turn.activePlayerId,
        );
      for (const cardId of [
        ...player.zones.base,
        ...controlledBattlefieldUnits,
      ]) {
        if (game.state.cardStates[cardId]) {
          game.state.cardStates[cardId]!.exhausted = false;
        }
      }
      turn.phase = "beginning";
      continue;
    }

    if (turn.phase === "beginning") {
      // Hold is the Beginning step. Advance the checkpoint before dispatching
      // triggers so resolution resumes at Channel instead of scoring twice.
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
        player.zones.runeDeck,
        player.zones.base,
        isNonStartingPlayersFirstTurn ? 3 : 2,
      );
      turn.phase = "draw";
      continue;
    }

    if (turn.phase === "draw") {
      draw(player.zones.mainDeck, player.zones.hand, 1);
      turn.phase = "action";
    }
    return;
  }
}

function draw(source: string[], destination: string[], count: number) {
  destination.push(...source.splice(0, Math.min(count, source.length)));
}
