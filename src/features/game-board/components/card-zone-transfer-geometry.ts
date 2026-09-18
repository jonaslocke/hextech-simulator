import type { ZoneKind } from "../types";

const BOARD_LOCATION_KINDS = new Set<ZoneKind | "battlefield">([
  "base",
  "battlefield",
]);

export function exactPlacementCandidateIndex(
  zoneId: string,
  candidateZoneIds: readonly (string | undefined)[],
) {
  return candidateZoneIds.findIndex(
    (candidateZoneId) => candidateZoneId === zoneId,
  );
}

export function boardLocationTransferNeedsDestinationRect({
  fromZoneId,
  fromZoneKind,
  hasDestinationRect,
  toZoneId,
  toZoneKind,
}: {
  fromZoneId: string;
  fromZoneKind: ZoneKind | "battlefield";
  hasDestinationRect: boolean;
  toZoneId: string;
  toZoneKind: ZoneKind | "battlefield";
}) {
  return (
    fromZoneId !== toZoneId &&
    BOARD_LOCATION_KINDS.has(fromZoneKind) &&
    BOARD_LOCATION_KINDS.has(toZoneKind) &&
    !hasDestinationRect
  );
}
