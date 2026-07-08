import type { ProjectedAction } from "@/shared/game";

export type BoardDropLocation = NonNullable<
  ProjectedAction["presentation"]["boardLocation"]
>;

export type BoardDragSourceLocation = BoardDropLocation | { kind: "champion" };

export type LocationDragActionKind = "move" | "play";

export type LocationDragActionCandidate = {
  action: ProjectedAction;
  actionKind: LocationDragActionKind;
  destination: BoardDropLocation;
  sourceCardInstanceId: string;
  sourceLocation: BoardDragSourceLocation;
};

const LOCATION_DRAG_ACTION_KINDS = new Set<string>(["move", "play"]);
const BOARD_DROP_ID_PREFIX = "board-drop";

export function projectedActionKind(action: Pick<ProjectedAction, "id">) {
  return action.id.split(":")[3] ?? "";
}

export function isLocationDragActionKind(
  kind: string,
): kind is LocationDragActionKind {
  return LOCATION_DRAG_ACTION_KINDS.has(kind);
}

export function locationDragActionKind(
  action: Pick<ProjectedAction, "id">,
): LocationDragActionKind | null {
  const kind = projectedActionKind(action);
  return isLocationDragActionKind(kind) ? kind : null;
}

export function sameBoardLocation(
  left: BoardDropLocation,
  right: BoardDropLocation,
) {
  if (left.kind === "base" || right.kind === "base") {
    return left.kind === right.kind;
  }

  return left.battlefieldId === right.battlefieldId;
}

export function boardLocationKey(location: BoardDropLocation) {
  return location.kind === "base"
    ? "base"
    : `battlefield:${location.battlefieldId}`;
}

export function boardDropLocationId(location: BoardDropLocation) {
  if (location.kind === "base") {
    return `${BOARD_DROP_ID_PREFIX}:base`;
  }

  return `${BOARD_DROP_ID_PREFIX}:battlefield:${encodeURIComponent(
    location.battlefieldId,
  )}`;
}

export function boardDropLocationFromId(id: string): BoardDropLocation | null {
  const [prefix, kind, encodedBattlefieldId] = id.split(":");

  if (prefix !== BOARD_DROP_ID_PREFIX) return null;

  if (kind === "base" && !encodedBattlefieldId) {
    return { kind: "base" };
  }

  if (kind === "battlefield" && encodedBattlefieldId) {
    return {
      kind: "battlefield",
      battlefieldId: decodeURIComponent(encodedBattlefieldId),
    };
  }

  return null;
}

export function sourceAllowsLocationDragActionKind(
  sourceLocation: BoardDragSourceLocation,
  actionKind: LocationDragActionKind,
) {
  if (sourceLocation.kind === "champion") {
    return actionKind === "play";
  }

  return actionKind === "move";
}

export function locationDragCandidatesForCard(input: {
  actions: readonly ProjectedAction[];
  sourceCardInstanceId: string;
  sourceLocation: BoardDragSourceLocation;
}): LocationDragActionCandidate[] {
  return input.actions.flatMap((action) => {
    if (!action.enabled) return [];
    if (action.sourceCardInstanceId !== input.sourceCardInstanceId) return [];

    const actionKind = locationDragActionKind(action);
    if (!actionKind) return [];

    if (!sourceAllowsLocationDragActionKind(input.sourceLocation, actionKind)) {
      return [];
    }

    const destination = action.presentation.boardLocation;
    if (!destination) return [];

    return [
      {
        action,
        actionKind,
        destination,
        sourceCardInstanceId: input.sourceCardInstanceId,
        sourceLocation: input.sourceLocation,
      },
    ];
  });
}

export function legalDropLocationsForCard(input: {
  actions: readonly ProjectedAction[];
  sourceCardInstanceId: string;
  sourceLocation: BoardDragSourceLocation;
}): BoardDropLocation[] {
  const locations = locationDragCandidatesForCard(input).map(
    (candidate) => candidate.destination,
  );
  const seen = new Set<string>();

  return locations.filter((location) => {
    const key = boardLocationKey(location);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function findLocationDragActionForDrop(input: {
  actions: readonly ProjectedAction[];
  destination: BoardDropLocation;
  sourceCardInstanceId: string;
  sourceLocation: BoardDragSourceLocation;
}): ProjectedAction | null {
  return (
    locationDragCandidatesForCard(input).find((candidate) =>
      sameBoardLocation(candidate.destination, input.destination),
    )?.action ?? null
  );
}
