import {
  createRuntimeCardIndex,
  isTemporaryCard,
  moveCardToTrash,
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
      if (index) {
        const temporary = [
          ...player.zones.base,
          ...game.state.battlefields.flatMap((battlefield) => [
            ...battlefield.units,
            ...(battlefield.attachedCardInstanceIds ?? []),
          ]),
        ].filter(
          (id) =>
            index.instances.get(id)?.ownerPlayerId === turn.activePlayerId &&
            isTemporaryCard(id, index),
        );
        for (const id of temporary) moveCardToTrash(game, id, index);
        if (game.state.chain || game.state.pendingChoice) return;
      }
      // Temporary cards leave before the Beginning-step scoring. Once that
      // cleanup has fully resolved, retain the existing checkpoint behavior so
      // a scoring trigger cannot score the same battlefield twice.
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
