import type { GameProjection } from "@/shared/game";

/**
 * Produces a viewer-safe reproduction payload for manual validation reports.
 * The input is already the server projection for the current viewer, so this
 * utility cannot expose canonical hidden information to the browser.
 */
export function formatGameStateDiagnostic(projection: GameProjection): string {
  return JSON.stringify(
    {
      game: projection,
      capturedAtStateVersion: projection.stateVersion,
      viewerPlayerId: projection.viewerPlayerId,
    },
    null,
    2,
  );
}
