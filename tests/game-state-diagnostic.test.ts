import assert from "node:assert/strict";
import { test } from "node:test";
import { formatGameStateDiagnostic } from "../src/features/game-board/game-state-diagnostic";
import type { GameProjection } from "../src/shared/game";

test("formats only the current viewer-safe projection for game-state diagnostics", () => {
  const projection = {
    id: "game-1",
    stateVersion: 7,
    viewerPlayerId: "p1",
    turn: { activePlayerId: "p1", phase: "action", turnNumber: 2 },
    chain: null,
    pendingChoice: null,
  } as unknown as GameProjection;

  assert.deepEqual(JSON.parse(formatGameStateDiagnostic(projection)), {
    game: projection,
    capturedAtStateVersion: 7,
    viewerPlayerId: "p1",
  });
});
