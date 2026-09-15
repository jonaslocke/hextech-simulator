import type { GameProjection } from "@/shared/game";

export type ChainRelationships = {
  cardIds: string[];
  chainIds: string[];
  battlefieldIds: string[];
  basePlayerIds: string[];
  labels: string[];
};

export function chainRelationships(projection: GameProjection, item: NonNullable<GameProjection["chain"]>["items"][number]): ChainRelationships {
  const cards = [...projection.players.flatMap((player) => player.zones.flatMap((zone) => zone.cards)),
    ...projection.battlefields.flatMap((field) => [field.card, ...field.units, ...(field.attachedCards ?? [])])];
  const result: ChainRelationships = { cardIds: [], chainIds: [], battlefieldIds: [], basePlayerIds: [], labels: [] };
  for (const id of item.targetCardInstanceIds) {
    const chainItem = projection.chain?.items.find((candidate) => candidate.id === id);
    const battlefield = projection.battlefields.find((candidate) => candidate.battlefieldId === id || candidate.card.instanceId === id);
    const card = cards.find((candidate) => candidate.instanceId === id);
    if (chainItem) {
      result.chainIds.push(chainItem.id);
      result.labels.push(`Targets Chain: ${chainItem.label}`);
    } else if (battlefield) {
      result.battlefieldIds.push(battlefield.battlefieldId);
      result.labels.push(`Location: ${battlefield.card.name}`);
    } else if (id === "base") {
      const selectedUnit = cards.find((candidate) => item.targetCardInstanceIds.includes(candidate.instanceId) && candidate.type.split(" / ").includes("Unit"));
      const playerId = selectedUnit?.ownerPlayerId ?? item.controllerPlayerId;
      result.basePlayerIds.push(playerId);
      result.labels.push(`Location: ${projection.players.find((player) => player.playerId === playerId)?.displayName ?? "Player"}'s Base`);
    } else if (card) {
      result.cardIds.push(id);
      result.labels.push(`Target: ${card.name}`);
    } else {
      const player = projection.players.find((candidate) => candidate.playerId === id);
      if (player) result.labels.push(`Player: ${player.displayName}`);
    }
  }
  return result;
}
