import type { GameProjection } from "@/shared/game";

type ProjectedAction = GameProjection["actions"][number];

export function availableBoardCardActions(
  actions: readonly ProjectedAction[],
  targetSelectionActive: boolean,
) {
  return actions.filter((action) =>
    action.enabled && (!targetSelectionActive || action.label.startsWith("Add ")),
  );
}
