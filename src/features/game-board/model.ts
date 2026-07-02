import type {
  GameProjection,
  ProjectedAction,
  ProjectedCardView,
  ProjectedZone
} from "@/shared/game";

export function actionsForSource(
  actions: readonly ProjectedAction[],
  sourceCardInstanceId: string | null
): ProjectedAction[] {
  return actions.filter((action) => action.sourceCardInstanceId === sourceCardInstanceId);
}

export function visibleCards(projection: GameProjection): ProjectedCardView[] {
  return [
    ...projection.players.flatMap((player) => player.zones.flatMap((zone) => zone.cards)),
    ...projection.battlefields.flatMap((battlefield) => [battlefield.card, ...battlefield.units])
  ];
}

export function zoneByKind(
  zones: readonly ProjectedZone[],
  kind: ProjectedZone["kind"]
): ProjectedZone | null {
  return zones.find((zone) => zone.kind === kind) ?? null;
}

