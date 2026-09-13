import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  BUG_REPORT_HISTORY_LIMIT,
  appendViewerSafeProjectionHistory,
  createStructuredBugReport,
  findRelatedProjectedCard,
  serializeStructuredBugReport,
  toggleRelatedProjectedCardSelection,
} from "../src/shared/bug-report";
import type { GameProjection } from "../src/shared/game";
import {
  bugReportArtifactFilename,
  sanitizeBugReportPathSegment,
  writeBugReportArtifact,
} from "../src/server/bug-report/artifact-writer";

function projection(stateVersion: number): GameProjection {
  return {
    id: "game-1",
    matchId: "match-1",
    gameNumber: 1,
    stateVersion,
    status: "in_progress",
    viewerPlayerId: "player-1",
    activePlayerId: "player-1",
    winnerPlayerId: null,
    victoryScore: 8,
    setup: { playerIds: ["player-1", "player-2"], startingPlayerChooserId: "player-1", startingPlayerId: "player-1", battlefieldChoices: {}, mulligans: {}, battlefieldPool: [], waitingReason: null },
    turn: { turnNumber: 1, activePlayerId: "player-1", phase: "action", passedPlayerIds: [] },
    showdown: null,
    combat: null,
    pendingChoice: null,
    players: [
      { playerId: "player-1", displayName: "Viewer", isViewer: true, points: 0, energy: 0, conditionalEnergy: 0, power: {}, zones: [{ kind: "hand", visibility: "private", count: 1, cards: [card("card-1", "player-1")] }] },
      { playerId: "player-2", displayName: "Opponent", isViewer: false, points: 0, energy: 0, conditionalEnergy: 0, power: {}, zones: [] },
    ],
    battlefields: [{ battlefieldId: "bf-1", selectedByPlayerId: "player-1", controllerPlayerId: "player-1", contestedByPlayerId: null, card: card("bf-card", "player-1"), units: [card("card-2", "player-2")], facedownCard: null }],
    chain: null,
    actions: [],
    logEntries: [],
  } as GameProjection;
}

function card(instanceId: string, ownerPlayerId: string) {
  return { instanceId, ownerPlayerId, name: `Card ${instanceId}`, imageUrl: null, rulesText: "", publicCode: "ABC-001", type: "Unit", supertype: null, domains: [], energy: null, might: null, power: null, computedMight: null, damage: 0, exhausted: false };
}

test("builds a versioned report from immutable viewer-safe captures", () => {
  const captured = projection(7);
  const report = createStructuredBugReport({ actual: "The action did not resolve.", expected: "The action resolves.", capturedAt: "2026-09-13T12:00:00.000Z", game: captured, notes: "Observed after passing.", recentStates: [projection(5), projection(6)], relatedCardInstanceIds: ["card-1", "card-2"], reportId: "report-1" });
  captured.players[0]!.zones[0]!.cards[0]!.name = "Mutated later";

  assert.equal(report.schemaVersion, 1);
  assert.equal(report.game.stateVersion, 7);
  assert.equal(report.game.players[0]!.zones[0]!.cards[0]!.name, "Card card-1");
  assert.deepEqual(report.recentStates.map((state) => state.stateVersion), [5, 6]);
  assert.deepEqual(report.relatedCards.map((card) => card.instanceId), ["card-1", "card-2"]);
  assert.equal(JSON.parse(serializeStructuredBugReport(report)).match.viewerPlayerId, "player-1");
});

test("keeps a bounded history of unique viewer-safe state versions", () => {
  let history: GameProjection[] = [];
  for (let stateVersion = 1; stateVersion <= BUG_REPORT_HISTORY_LIMIT + 2; stateVersion += 1) history = appendViewerSafeProjectionHistory(history, projection(stateVersion));
  history = appendViewerSafeProjectionHistory(history, projection(BUG_REPORT_HISTORY_LIMIT + 2));
  assert.deepEqual(history.map((state) => state.stateVersion), [3, 4, 5, 6]);
});

test("locates diagnostic card identities in projected locations only", () => {
  const related = findRelatedProjectedCard(projection(3), "card-2");
  assert.deepEqual(related?.location, { kind: "battlefield", battlefieldId: "bf-1", role: "unit" });
  assert.equal(findRelatedProjectedCard(projection(3), "missing"), null);
});

test("toggles only related cards that exist in the captured projection", () => {
  const captured = projection(3);
  const selected = toggleRelatedProjectedCardSelection({ instanceId: "card-1", projection: captured, selectedCardInstanceIds: new Set() });
  assert.deepEqual([...selected], ["card-1"]);
  assert.deepEqual(
    [...toggleRelatedProjectedCardSelection({ instanceId: "card-1", projection: captured, selectedCardInstanceIds: selected })],
    [],
  );
  assert.deepEqual(
    [...toggleRelatedProjectedCardSelection({ instanceId: "unknown", projection: captured, selectedCardInstanceIds: selected })],
    ["card-1"],
  );
});

test("sanitizes artifact names without allowing path segments", () => {
  assert.equal(sanitizeBugReportPathSegment("../game id"), "game-id");
  const report = createStructuredBugReport({ actual: "actual", expected: "expected", capturedAt: "2026-09-13T12:00:00.000Z", game: projection(3), recentStates: [], relatedCardInstanceIds: [], reportId: "report" });
  assert.equal(bugReportArtifactFilename(report), "2026-09-13T12-00-00-000Z-game-1-v3.json");
});

test("writes the canonical payload under the workspace bug-report directory", async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "hextech-bug-report-"));
  const report = createStructuredBugReport({ actual: "actual", expected: "expected", capturedAt: "2026-09-13T12:00:00.000Z", game: projection(3), recentStates: [], relatedCardInstanceIds: [], reportId: "report" });
  try {
    const result = await writeBugReportArtifact({ report, workspaceRoot });
    assert.equal(result.artifactPath, ".agent-work/bug-reports/2026-09-13T12-00-00-000Z-game-1-v3.json");
    const written = await readFile(path.join(workspaceRoot, result.artifactPath), "utf8");
    assert.deepEqual(JSON.parse(written), report);
  } finally {
    await rm(workspaceRoot, { force: true, recursive: true });
  }
});
