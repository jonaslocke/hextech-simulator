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
  const targetGroups = item.targetCardInstanceIdGroups ?? [item.targetCardInstanceIds];
  for (const [groupIndex, targetIds] of targetGroups.entries()) {
    const executionPrefix = item.targetCardInstanceIdGroups
      ? `Execution ${groupIndex + 1} · `
      : "";
    for (const id of targetIds) {
      const chainItem = projection.chain?.items.find((candidate) => candidate.id === id);
      const battlefield = projection.battlefields.find((candidate) => candidate.battlefieldId === id || candidate.card.instanceId === id);
      const card = cards.find((candidate) => candidate.instanceId === id);
      if (chainItem) {
        result.chainIds.push(chainItem.id);
        result.labels.push(`${executionPrefix}Targets Chain: ${chainItem.label}`);
      } else if (battlefield) {
        result.battlefieldIds.push(battlefield.battlefieldId);
        result.labels.push(`${executionPrefix}Location: ${battlefield.card.name}`);
      } else if (id === "base") {
        const selectedUnit = cards.find((candidate) => targetIds.includes(candidate.instanceId) && candidate.type.split(" / ").includes("Unit"));
        const playerId = selectedUnit?.ownerPlayerId ?? item.controllerPlayerId;
        result.basePlayerIds.push(playerId);
        result.labels.push(`${executionPrefix}Location: ${projection.players.find((player) => player.playerId === playerId)?.displayName ?? "Player"}'s Base`);
      } else if (card) {
        result.cardIds.push(id);
        result.labels.push(`${executionPrefix}Target: ${card.name}`);
      } else {
        const player = projection.players.find((candidate) => candidate.playerId === id);
        if (player) result.labels.push(`${executionPrefix}Player: ${player.displayName}`);
      }
    }
  }
  return result;
}
