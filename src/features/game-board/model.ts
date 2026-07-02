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

export function showdownPromptState(
  projection: Pick<GameProjection, "showdown" | "viewerPlayerId">
) {
  const showdown = projection.showdown;
  if (!showdown) return null;
  return {
    battlefieldId: showdown.battlefieldId,
    focusPlayerId: showdown.focusPlayerId,
    hasFocus: showdown.focusPlayerId === projection.viewerPlayerId,
    kind: showdown.kind,
    passedPlayerIds: showdown.passedPlayerIds
  };
}

export function simultaneousMoveAction(
  actions: readonly ProjectedAction[],
  selectedAction: ProjectedAction,
  sourceCardInstanceId: string
): ProjectedAction | null {
  if (actionKind(selectedAction) !== "move") return null;
  const destination = actionExtra(selectedAction);
  if (!destination || destination === "base") return null;
  return actions.find((candidate) =>
    actionKind(candidate) === "moveMany" &&
    actionExtra(candidate) === destination &&
    candidate.targets.some((target) =>
      target.kind === "card" &&
      target.legalIds.includes(sourceCardInstanceId)
    )
  ) ?? null;
}

export function moveSelectionTitle(
  action: ProjectedAction | undefined,
  battlefields: readonly {
    battlefieldId: string;
    card: { name: string };
    units: readonly unknown[];
  }[]
): string | undefined {
  if (!action || actionKind(action) !== "moveMany") return undefined;
  const destination = actionExtra(action);
  const battlefield = battlefields.find(
    (candidate) => candidate.battlefieldId === destination
  );
  return battlefield
    ? `Choose units to ${battlefield.units.length === 0 ? "Conquer" : "Contest"} ${battlefield.card.name}`
    : undefined;
}

function actionKind(action: ProjectedAction) {
  return action.id.split(":")[3] ?? "";
}

function actionExtra(action: ProjectedAction) {
  const encoded = action.id.split(":")[5];
  return encoded ? decodeURIComponent(encoded) : null;
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
