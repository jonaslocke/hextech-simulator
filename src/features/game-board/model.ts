import type {
  GameProjection,
  ProjectedAction,
  ProjectedCardView,
  ProjectedZone
} from "@/shared/game";
export function chainOverlayOpen(
  isOpen: boolean,
  wasChainLockedOpen: boolean,
  isChainLockedOpen: boolean,
): boolean {
  if (isChainLockedOpen) return true;
  if (wasChainLockedOpen) return false;
  return isOpen;
}

export function actionsForSource(
  actions: readonly ProjectedAction[],
  sourceCardInstanceId: string | null
): ProjectedAction[] {
  return actions.filter((action) => action.sourceCardInstanceId === sourceCardInstanceId);
}

export function showdownPromptState(
  projection: Pick<GameProjection, "chain" | "showdown" | "viewerPlayerId"> &
    Partial<Pick<GameProjection, "battlefields" | "combat" | "pendingChoice">>
) {
  const showdown = projection.showdown;
  if (!showdown) return null;
  const isClosed = projection.chain !== null;
  const hasFocus = showdown.focusPlayerId === projection.viewerPlayerId;
  const priorityPlayerId = projection.chain?.priorityPlayerId ?? null;
  const isFinalFocusPass =
    hasFocus &&
    !isClosed &&
    showdown.relevantPlayerIds.every(
      (playerId) =>
        playerId === projection.viewerPlayerId ||
        showdown.passedPlayerIds.includes(playerId)
    );
  const battlefield = projection.battlefields?.find(
    (candidate) => candidate.battlefieldId === showdown.battlefieldId
  );
  const combat = projection.combat;
  const mightFor = (unitIds: readonly string[]) =>
    battlefield?.units
      .filter((unit) => unitIds.includes(unit.instanceId))
      .reduce(
        (total, unit) =>
          total + (unit.computedMight ?? unit.might ?? 0),
        0
      ) ?? null;
  const attackerMight =
    combat?.battlefieldId === showdown.battlefieldId
      ? mightFor(combat.attackerUnitIds)
      : null;
  const defenderMight =
    combat?.battlefieldId === showdown.battlefieldId
      ? mightFor(combat.defenderUnitIds)
      : null;
  return {
    attackerMight,
    battlefieldId: showdown.battlefieldId,
    canPassFocus: hasFocus && !isClosed && !projection.pendingChoice,
    defenderMight,
    focusPlayerId: showdown.focusPlayerId,
    hasFocus,
    hasPriority: priorityPlayerId === projection.viewerPlayerId,
    isClosed,
    isFinalFocusPass,
    kind: showdown.kind,
    passedPlayerIds: showdown.passedPlayerIds,
    priorityPlayerId
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

export type CombinedTargetRequirement = {
  legalIds: string[];
  maximum: number;
  minimum: number;
  requirements: ProjectedAction["targets"];
};

export function combineTargetRequirements(
  action: ProjectedAction,
  kind: ProjectedAction["targets"][number]["kind"],
): CombinedTargetRequirement | null {
  const requirements = action.targets.filter(
    (requirement) => requirement.kind === kind,
  );
  if (requirements.length === 0) return null;

  return {
    legalIds: [
      ...new Set(requirements.flatMap((requirement) => requirement.legalIds)),
    ],
    maximum: requirements.reduce(
      (total, requirement) => total + requirement.maximum,
      0,
    ),
    minimum: requirements.reduce(
      (total, requirement) => total + requirement.minimum,
      0,
    ),
    requirements,
  };
}

export function targetSelectionIsLegal(
  requirement: CombinedTargetRequirement,
  selectedIds: readonly string[],
): boolean {
  return (
    selectedIds.length >= requirement.minimum &&
    selectedIds.length <= requirement.maximum &&
    selectedIds.every((id) => requirement.legalIds.includes(id)) &&
    (new Set(selectedIds).size === selectedIds.length ||
      requirementsShareLegalTargets(requirement.requirements)) &&
    allocateTargetSelections(requirement.requirements, selectedIds).every(
      (selected, index) =>
        selected.length >= requirement.requirements[index]!.minimum &&
        selected.length <= requirement.requirements[index]!.maximum,
    )
  );
}

export function targetSelectionCanAdd(
  requirement: CombinedTargetRequirement,
  selectedIds: readonly string[],
  candidateId: string,
): boolean {
  if (!requirement.legalIds.includes(candidateId)) {
    return false;
  }
  if (
    selectedIds.includes(candidateId) &&
    !requirementsShareLegalTargets(requirement.requirements)
  ) {
    return false;
  }

  const proposedIds = [...selectedIds, candidateId];
  return (
    proposedIds.length <= requirement.maximum &&
    allocateTargetSelections(requirement.requirements, proposedIds).every(
      (selected, index) =>
        selected.length <= requirement.requirements[index]!.maximum,
    )
  );
}

function requirementsShareLegalTargets(requirements: ProjectedAction["targets"]) {
  const first = requirements[0]?.legalIds;
  return Boolean(first) && requirements.every(
    (requirement) =>
      requirement.legalIds.length === first.length &&
      requirement.legalIds.every((id) => first.includes(id)),
  );
}

function allocateTargetSelections(
  requirements: ProjectedAction["targets"],
  selectedIds: readonly string[],
) {
  let cursor = 0;
  return requirements.map((individual) => {
    const selected: string[] = [];
    while (cursor < selectedIds.length && selected.length < individual.maximum) {
      const candidate = selectedIds[cursor++]!;
      if (!individual.legalIds.includes(candidate)) {
        return Array.from({ length: individual.maximum + 1 }, () => candidate);
      }
      selected.push(candidate);
    }
    return selected;
  });
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
