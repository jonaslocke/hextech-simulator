import type { GameDocument } from "./state";
import type { RuntimeCardIndex } from "./primitive-handlers";

/**
 * Board-location bookkeeping for rules attachment (716--719).  The card-state
 * link is the authoritative relationship; battlefield attachment lists only
 * record where an attached non-Unit permanent is physically present.
 */
export function attachCardToTopMost(
  game: GameDocument,
  attachedCardInstanceId: string,
  topMostCardInstanceId: string,
  index: RuntimeCardIndex,
) {
  if (attachedCardInstanceId === topMostCardInstanceId) {
    throw new Error("A card cannot attach to itself.");
  }
  const state = game.state.cardStates[attachedCardInstanceId];
  if (!state) throw new Error("Attached card state is unavailable.");
  if (state.attachedToCardInstanceId === topMostCardInstanceId) return;

  removeFromAttachmentLocations(game, attachedCardInstanceId);
  state.attachedToCardInstanceId = topMostCardInstanceId;
  placeAttachedCardWithTopMost(
    game,
    attachedCardInstanceId,
    topMostCardInstanceId,
    index,
  );
}

/** Moves every attached card whenever its Top-Most Card changes board location. */
export function moveAttachedCardsWithTopMost(
  game: GameDocument,
  topMostCardInstanceId: string,
  index: RuntimeCardIndex,
) {
  for (const attachedCardInstanceId of attachedCardIds(
    game,
    topMostCardInstanceId,
  )) {
    placeAttachedCardWithTopMost(
      game,
      attachedCardInstanceId,
      topMostCardInstanceId,
      index,
    );
  }
}

/**
 * A Top-Most Card leaving the board detaches its attachments at its last board
 * location. Call this after removing the Top-Most Card: attachment location
 * bookkeeping deliberately remains in place until the next cleanup.
 */
export function detachCardsFromTopMostLeavingBoard(
  game: GameDocument,
  topMostCardInstanceId: string,
) {
  for (const attachedCardInstanceId of attachedCardIds(
    game,
    topMostCardInstanceId,
  )) {
    game.state.cardStates[attachedCardInstanceId]!.attachedToCardInstanceId =
      null;
  }
}

/** Detaches one card, leaving it at its current Top-Most Card's location. */
export function detachCard(game: GameDocument, attachedCardInstanceId: string) {
  const state = game.state.cardStates[attachedCardInstanceId];
  if (!state?.attachedToCardInstanceId) return null;
  const topMostCardInstanceId = state.attachedToCardInstanceId;
  state.attachedToCardInstanceId = null;
  return topMostCardInstanceId;
}

export function attachedCardIds(
  game: GameDocument,
  topMostCardInstanceId: string,
) {
  return Object.entries(game.state.cardStates)
    .filter(([, state]) => state.attachedToCardInstanceId === topMostCardInstanceId)
    .map(([cardInstanceId]) => cardInstanceId);
}

/** Recalls unattached non-Unit Gear left at a battlefield during cleanup. */
export function recallUnattachedGearAtBattlefields(
  game: GameDocument,
  index: RuntimeCardIndex,
) {
  for (const battlefield of game.state.battlefields) {
    const attachedIds = battlefield.attachedCardInstanceIds ?? [];
    for (const cardInstanceId of [...attachedIds]) {
      const state = game.state.cardStates[cardInstanceId];
      const definition = definitionFor(cardInstanceId, index);
      if (
        state?.attachedToCardInstanceId ||
        definition.card.classification.type !== "Gear"
      ) {
        continue;
      }
      battlefield.attachedCardInstanceIds = attachedIds.filter(
        (id) => id !== cardInstanceId,
      );
      const ownerPlayerId = index.instances.get(cardInstanceId)?.ownerPlayerId;
      if (!ownerPlayerId) continue;
      const base = game.state.players[ownerPlayerId]!.zones.base;
      if (!base.includes(cardInstanceId)) base.push(cardInstanceId);
    }
  }
}

/** Removes a card that has left the board from attachment-location bookkeeping. */
export function removeFromAttachmentLocations(
  game: GameDocument,
  cardInstanceId: string,
) {
  for (const battlefield of game.state.battlefields) {
    battlefield.attachedCardInstanceIds = (
      battlefield.attachedCardInstanceIds ?? []
    ).filter((id) => id !== cardInstanceId);
  }
}

function placeAttachedCardWithTopMost(
  game: GameDocument,
  attachedCardInstanceId: string,
  topMostCardInstanceId: string,
  index: RuntimeCardIndex,
) {
  removeFromAttachmentLocations(game, attachedCardInstanceId);
  for (const player of Object.values(game.state.players)) {
    player.zones.base = player.zones.base.filter(
      (id) => id !== attachedCardInstanceId,
    );
  }

  const battlefield = game.state.battlefields.find((candidate) =>
    candidate.units.includes(topMostCardInstanceId),
  );
  if (battlefield) {
    const ids = (battlefield.attachedCardInstanceIds ??= []);
    if (!ids.includes(attachedCardInstanceId)) ids.push(attachedCardInstanceId);
    return;
  }

  const topMostOwnerPlayerId = index.instances.get(
    topMostCardInstanceId,
  )?.ownerPlayerId;
  if (!topMostOwnerPlayerId) {
    throw new Error("Top-Most Card owner is unavailable.");
  }
  game.state.players[topMostOwnerPlayerId]!.zones.base.push(
    attachedCardInstanceId,
  );
}

function definitionFor(cardInstanceId: string, index: RuntimeCardIndex) {
  const instance = index.instances.get(cardInstanceId);
  const definition = instance && index.definitions.get(instance.cardCode);
  if (!definition) throw new Error(`Card definition unavailable: ${cardInstanceId}`);
  return definition;
}
