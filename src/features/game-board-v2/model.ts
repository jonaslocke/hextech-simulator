import type {
  GameProjectionV2,
  ProjectedAction,
  ProjectedCardView,
  ProjectedZoneV2
} from "@/shared/game-v2";

export function actionsForSource(
  actions: readonly ProjectedAction[],
  sourceCardInstanceId: string | null
): ProjectedAction[] {
  return actions.filter((action) => action.sourceCardInstanceId === sourceCardInstanceId);
}

export function visibleCards(projection: GameProjectionV2): ProjectedCardView[] {
  return [
    ...projection.players.flatMap((player) => player.zones.flatMap((zone) => zone.cards)),
    ...projection.battlefields.flatMap((battlefield) => [battlefield.card, ...battlefield.units])
  ];
}

export function zoneByKind(
  zones: readonly ProjectedZoneV2[],
  kind: ProjectedZoneV2["kind"]
): ProjectedZoneV2 | null {
  return zones.find((zone) => zone.kind === kind) ?? null;
}

