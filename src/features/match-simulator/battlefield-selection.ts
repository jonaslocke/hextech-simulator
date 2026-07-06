import type { GameProjection } from "@/shared/game";

export function buildBattlefieldSelectionModel(input: {
  actions: GameProjection["actions"];
  battlefieldPool: GameProjection["setup"]["battlefieldPool"];
  matchId: string;
  viewerPlayerId: string;
}) {
  const actionByBattlefieldId = new Map(
    input.actions.flatMap((action) =>
      action.presentation.surface === "setup-dialog" &&
      action.sourceCardInstanceId
        ? [[action.sourceCardInstanceId, action] as const]
        : [],
    ),
  );
  const battlefieldById = new Map(
    input.battlefieldPool.map((card) => [card.instanceId, card]),
  );
  const optionIds = [...actionByBattlefieldId.keys()];

  return {
    actionByBattlefieldId,
    decisionKey: JSON.stringify([
      "setup",
      "battlefield",
      input.matchId,
      input.viewerPlayerId,
      [...optionIds].sort(),
    ]),
    options: optionIds.map((id) => {
      const action = actionByBattlefieldId.get(id)!;
      const card = battlefieldById.get(id);
      return {
        id,
        imageUrl: card?.imageUrl ?? undefined,
        label: card?.name ?? action.label,
      };
    }),
  };
}
