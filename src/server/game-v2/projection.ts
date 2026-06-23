import { gameProjectionV2Schema, type GameProjectionV2, type ProjectedCardView, type ProjectedZoneV2 } from "../../shared/game-v2";
import type { DeckSnapshotDocumentV2, GameEventDocumentV2 } from "./repositories";
import { setupActionsV2 } from "./setup";
import { gameplayActionsV2 } from "./actions";
import type { GameDocumentV2 } from "./state";

export function projectGameV2(input: {
  game: GameDocumentV2; viewerPlayerId: string;
  decks: DeckSnapshotDocumentV2[]; events?: GameEventDocumentV2[];
}): GameProjectionV2 {
  const definitions = new Map(input.decks.flatMap((deck) => deck.snapshot.cards.map((definition) => [definition.cardCode, definition] as const)));
  const instances = new Map(input.decks.flatMap((deck) => deck.instances.map((instance) => [instance.instanceId, instance] as const)));
  const view = (id: string): ProjectedCardView => {
    const instance = instances.get(id)!;
    const definition = definitions.get(instance.cardCode)!;
    const state = input.game.state.cardStates[id]!;
    const card = definition.card;
    return {
      instanceId: id, ownerPlayerId: instance.ownerPlayerId, name: card.name,
      imageUrl: card.media.image_url ?? null, rulesText: card.text.plain,
      publicCode: card.public_code, type: card.classification.type,
      supertype: card.classification.supertype, domains: card.classification.domain,
      energy: card.attributes.energy, might: card.attributes.might, power: card.attributes.power,
      computedMight: state.computedMight, damage: state.damage, exhausted: state.exhausted
    };
  };
  const players = input.game.state.setup.playerIds.map((playerId) => {
    const player = input.game.state.players[playerId]!;
    const isViewer = playerId === input.viewerPlayerId;
    const zones = (Object.entries(player.zones) as Array<[ProjectedZoneV2["kind"], string[] | string | null]>).map(([kind, value]) => {
      const ids = Array.isArray(value) ? value : value ? [value] : [];
      const visibility = kind === "hand" ? (isViewer ? "private" : "secret") : (["mainDeck", "runeDeck"].includes(kind) ? "secret" : "public");
      return { kind, visibility, count: ids.length, cards: visibility === "secret" ? [] : ids.map(view) };
    });
    return { playerId, isViewer, energy: player.energy, conditionalEnergy: player.conditionalEnergy, power: player.power, zones };
  });
  return gameProjectionV2Schema.parse({
    id: input.game.id, matchId: input.game.matchId, stateVersion: input.game.stateVersion,
    status: input.game.status, viewerPlayerId: input.viewerPlayerId,
    activePlayerId: input.game.state.turn?.activePlayerId ?? null,
    winnerPlayerId: input.game.winnerPlayerId, players,
    battlefields: input.game.state.battlefields.map((battlefield) => ({
      battlefieldId: battlefield.battlefieldId, card: view(battlefield.cardInstanceId), units: battlefield.units.map(view)
    })),
    chain: input.game.state.chain?.items ?? [],
    actions: (input.game.status === "setup_pending"
      ? setupActionsV2(input.game, input.viewerPlayerId)
      : gameplayActionsV2(input.game, input.viewerPlayerId, input.decks))
      .map((action) => {
        if (!action.id.includes(":setup:lockBattlefield:")) return action;
        const cardId = action.id.split(":").slice(4).join(":");
        return { ...action, label: `Choose ${view(cardId).name}` };
      }),
    logEntries: (input.events ?? []).map((event) => ({ id: event.id, message: event.message, createdAt: event.createdAt }))
  });
}
