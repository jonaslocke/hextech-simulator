import {
  createRuntimeCardIndex,
  type RuntimeCardIndex,
} from "./primitive-handlers";
import type { DeckSnapshotDocument } from "./repositories";
import { applyHoldScoring } from "./scoring";
import {
  dispatchBehaviorEvent,
  dispatchSimultaneousBehaviorEvents,
} from "./triggers";
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
    runtimeIndex ?? (decks.length ? createRuntimeCardIndex(decks, game) : null);

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
      player.conqueredBattlefieldIdsThisTurn = [];
      const controlledBattlefieldUnits = game.state.battlefields
        .flatMap((battlefield) => battlefield.units)
        .filter(
          (cardId) =>
            index?.instances.get(cardId)?.ownerPlayerId ===
            turn.activePlayerId,
        );
      const readiedCardIds: string[] = [];
      for (const cardId of [
        ...(player.zones.legend ? [player.zones.legend] : []),
        ...player.zones.base,
        ...controlledBattlefieldUnits,
      ]) {
        if (game.state.cardStates[cardId]?.exhausted) {
          game.state.cardStates[cardId]!.exhausted = false;
          readiedCardIds.push(cardId);
        }
      }
      turn.phase = "beginning";
      if (decks.length > 0 && readiedCardIds.length > 0) {
        dispatchSimultaneousBehaviorEvents(
          game,
          readiedCardIds.map((cardId) => ({
            type: "card.readied",
            actorPlayerId: turn.activePlayerId,
            subjectCardInstanceId: cardId,
            values: {},
          })),
          decks,
        );
      }
      continue;
    }

    if (turn.phase === "beginning") {
      if (decks.length && !turn.beginningTriggersQueued) {
        turn.beginningTriggersQueued = true;
        const isFirstBeginningPhase = player.hasTakenBeginningPhase !== true;
        player.hasTakenBeginningPhase = true;
        dispatchBehaviorEvent(game, {
          type: "turn.beginning", actorPlayerId: turn.activePlayerId,
          subjectCardInstanceId: null,
          values: { isFirstBeginningPhase },
        }, decks);
        if (game.state.chain || game.state.pendingChoice) return;
      }
      if (decks.length) {
        applyHoldScoring(game, turn.activePlayerId, decks);
      }
      turn.phase = "channel";
      delete turn.beginningTriggersQueued;
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
