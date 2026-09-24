import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  appendViewerSafeProjectionHistory,
  createStructuredBugReport,
  findRelatedProjectedCard,
  routeReportCardInteraction,
  toggleRelatedProjectedCardSelection,
} from "../src/features/game-board/bug-report";
import {
  BUG_REPORT_HISTORY_LIMIT,
  BUG_REPORT_MAX_ISSUE_TEXT_LENGTH,
  BUG_REPORT_MAX_PAYLOAD_BYTES,
  BUG_REPORT_MAX_RELATED_CARDS,
  serializeStructuredBugReport,
} from "../src/shared/bug-report";
import type { GameProjection } from "../src/shared/game";
import {
  bugReportArtifactFilename,
  BugReportArtifactCapacityError,
  BugReportArtifactPersistenceDisabledError,
  LOCAL_BUG_REPORT_ARTIFACTS_ENV,
  localBugReportArtifactPersistenceEnabled,
  MAX_LOCAL_BUG_REPORT_ARTIFACTS,
  sanitizeBugReportPathSegment,
  writeBugReportArtifact,
} from "../src/server/bug-report/artifact-writer";
import { POST as postBugReport } from "../src/app/api/bug-reports/route";

const enabledLocalEnvironment = {
  NODE_ENV: "development",
  [LOCAL_BUG_REPORT_ARTIFACTS_ENV]: "true",
};

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
    battlefields: [{ battlefieldId: "bf-1", selectedByPlayerId: "player-1", controllerPlayerId: "player-1", contestedByPlayerId: null, card: card("bf-card", "player-1"), units: [card("card-2", "player-2")], facedownCard: null, facedownCardPresent: false }],
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

test("locates attached battlefield and effect-selection visible cards", () => {
  const captured = projection(3);
  const attachedCard = card("attached-card", "player-1");
  const visibleCard = card("visible-choice-card", "player-1");
  captured.battlefields[0]!.attachedCards = [attachedCard];
  captured.pendingChoice = {
    id: "effect-choice",
    maximum: 1,
    minimum: 1,
    playerId: "player-1",
    presentation: "cardSelection",
    prompt: "Choose a visible card.",
    revealedCards: [],
    sourceZone: "hand",
    title: "Card selection",
    type: "effectSelection",
    visibleCards: [visibleCard],
    waitingMessage: "Waiting for a choice.",
  };

  assert.deepEqual(findRelatedProjectedCard(captured, attachedCard.instanceId)?.location, {
    kind: "battlefield",
    battlefieldId: "bf-1",
    role: "attachment",
  });
  assert.deepEqual(findRelatedProjectedCard(captured, visibleCard.instanceId)?.location, {
    kind: "pendingChoice",
    choiceId: "effect-choice",
  });
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

test("routes report-mode card interactions without invoking gameplay selection", () => {
  const diagnosticToggles: string[] = [];
  let gameplayInteractions = 0;

  assert.equal(
    routeReportCardInteraction({
      instanceId: "card-1",
      isReportMode: true,
      onDiagnosticToggle: (instanceId) => diagnosticToggles.push(instanceId),
      onGameplayInteraction: () => {
        gameplayInteractions += 1;
      },
    }),
    "diagnostic",
  );
  assert.deepEqual(diagnosticToggles, ["card-1"]);
  assert.equal(gameplayInteractions, 0);

  assert.equal(
    routeReportCardInteraction({
      instanceId: "card-1",
      isReportMode: false,
      onDiagnosticToggle: (instanceId) => diagnosticToggles.push(instanceId),
      onGameplayInteraction: () => {
        gameplayInteractions += 1;
      },
    }),
    "gameplay",
  );
  assert.deepEqual(diagnosticToggles, ["card-1"]);
  assert.equal(gameplayInteractions, 1);

  assert.equal(
    routeReportCardInteraction({
      isReportMode: true,
      onDiagnosticToggle: (instanceId) => diagnosticToggles.push(instanceId),
      onGameplayInteraction: () => {
        gameplayInteractions += 1;
      },
    }),
    "ignored",
  );
  assert.equal(gameplayInteractions, 1);
});

test("does not add diagnostic selections beyond the related-card limit", () => {
  const selectedCardInstanceIds = new Set(
    Array.from({ length: BUG_REPORT_MAX_RELATED_CARDS }, (_, index) =>
      index === 0 ? "card-1" : `card-${index + 1}`,
    ),
  );
  assert.deepEqual(
    toggleRelatedProjectedCardSelection({
      instanceId: "card-1",
      projection: projection(3),
      selectedCardInstanceIds,
    }),
    new Set(Array.from(selectedCardInstanceIds).filter((id) => id !== "card-1")),
  );
  assert.deepEqual(
    toggleRelatedProjectedCardSelection({
      instanceId: "card-1",
      projection: projection(3),
      selectedCardInstanceIds: new Set(
        Array.from({ length: BUG_REPORT_MAX_RELATED_CARDS }, (_, index) =>
          index === 0 ? "card-2" : `card-${index + 2}`,
        ),
      ),
    }),
    new Set(
      Array.from({ length: BUG_REPORT_MAX_RELATED_CARDS }, (_, index) =>
        index === 0 ? "card-2" : `card-${index + 2}`,
      ),
    ),
  );
});

test("sanitizes artifact names without allowing path segments", () => {
  assert.equal(sanitizeBugReportPathSegment("../game id"), "game-id");
  const report = createStructuredBugReport({ actual: "actual", expected: "expected", capturedAt: "2026-09-13T12:00:00.000Z", game: projection(3), recentStates: [], relatedCardInstanceIds: [], reportId: "report" });
  assert.equal(localBugReportArtifactPersistenceEnabled({ [LOCAL_BUG_REPORT_ARTIFACTS_ENV]: "true" }), false);
  assert.equal(bugReportArtifactFilename(report), "2026-09-13T12-00-00-000Z-game-1-v3.json");
});

test("bounds user-authored text and related-card collections", () => {
  assert.throws(() =>
    createStructuredBugReport({
      actual: "x".repeat(BUG_REPORT_MAX_ISSUE_TEXT_LENGTH + 1),
      expected: "expected",
      capturedAt: "2026-09-13T12:00:00.000Z",
      game: projection(3),
      recentStates: [],
      relatedCardInstanceIds: [],
      reportId: "report",
    }),
  );
  assert.throws(() =>
    createStructuredBugReport({
      actual: "actual",
      expected: "expected",
      capturedAt: "2026-09-13T12:00:00.000Z",
      game: projection(3),
      recentStates: [],
      relatedCardInstanceIds: Array.from(
        { length: BUG_REPORT_MAX_RELATED_CARDS + 1 },
        () => "card-1",
      ),
      reportId: "report",
    }),
  );
});

test("requires explicit non-production opt-in for local artifacts", async () => {
  const report = createStructuredBugReport({ actual: "actual", expected: "expected", capturedAt: "2026-09-13T12:00:00.000Z", game: projection(3), recentStates: [], relatedCardInstanceIds: [], reportId: "report" });
  assert.equal(localBugReportArtifactPersistenceEnabled({ NODE_ENV: "development" }), false);
  assert.equal(localBugReportArtifactPersistenceEnabled({ NODE_ENV: "production", [LOCAL_BUG_REPORT_ARTIFACTS_ENV]: "true" }), false);
  assert.equal(localBugReportArtifactPersistenceEnabled(enabledLocalEnvironment), true);
  await assert.rejects(
    () => writeBugReportArtifact({ environment: { NODE_ENV: "development" }, report }),
    BugReportArtifactPersistenceDisabledError,
  );
});

test("rejects disabled persistence before processing the report payload", async () => {
  await withArtifactPersistenceEnvironment(
    { NODE_ENV: "production", [LOCAL_BUG_REPORT_ARTIFACTS_ENV]: "true" },
    async () => {
      const response = await postBugReport(
        new Request("http://localhost/api/bug-reports", {
          body: "not valid JSON",
          headers: { "content-type": "application/json" },
          method: "POST",
        }),
      );
      assert.equal(response.status, 503);
      assert.equal(
        (await response.json()).error.code,
        "artifact_persistence_disabled",
      );
    },
  );
});

test("rejects oversized report bodies in the enabled local endpoint", async () => {
  await withArtifactPersistenceEnvironment(enabledLocalEnvironment, async () => {
    const response = await postBugReport(
      new Request("http://localhost/api/bug-reports", {
        body: "x".repeat(BUG_REPORT_MAX_PAYLOAD_BYTES + 1),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    assert.equal(response.status, 413);
    assert.equal((await response.json()).error.code, "payload_too_large");
  });
});

test("writes the canonical payload under the workspace bug-report directory", async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "hextech-bug-report-"));
  const report = createStructuredBugReport({ actual: "actual", expected: "expected", capturedAt: "2026-09-13T12:00:00.000Z", game: projection(3), recentStates: [], relatedCardInstanceIds: [], reportId: "report" });
  try {
    const result = await writeBugReportArtifact({
      environment: enabledLocalEnvironment,
      report,
      workspaceRoot,
    });
    assert.equal(result.artifactPath, ".agent-work/bug-reports/2026-09-13T12-00-00-000Z-game-1-v3.json");
    const written = await readFile(path.join(workspaceRoot, result.artifactPath), "utf8");
    assert.deepEqual(JSON.parse(written), report);
  } finally {
    await rm(workspaceRoot, { force: true, recursive: true });
  }
});

test("rejects new artifacts after the bounded local directory capacity", async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "hextech-bug-report-capacity-"));
  const reportsDirectory = path.join(workspaceRoot, ".agent-work", "bug-reports");
  const report = createStructuredBugReport({ actual: "actual", expected: "expected", capturedAt: "2026-09-13T12:00:00.000Z", game: projection(3), recentStates: [], relatedCardInstanceIds: [], reportId: "report" });
  try {
    await mkdir(reportsDirectory, { recursive: true });
    await Promise.all(
      Array.from({ length: MAX_LOCAL_BUG_REPORT_ARTIFACTS }, (_, index) =>
        writeFile(path.join(reportsDirectory, `existing-${index}.json`), "{}"),
      ),
    );
    await assert.rejects(
      () =>
        writeBugReportArtifact({
          environment: enabledLocalEnvironment,
          report,
          workspaceRoot,
        }),
      BugReportArtifactCapacityError,
    );
  } finally {
    await rm(workspaceRoot, { force: true, recursive: true });
  }
});

async function withArtifactPersistenceEnvironment(
  environment: Record<string, string>,
  callback: () => Promise<void>,
) {
  const processEnvironment = process.env as Record<string, string | undefined>;
  const previousNodeEnvironment = processEnvironment.NODE_ENV;
  const previousArtifactFlag = processEnvironment[LOCAL_BUG_REPORT_ARTIFACTS_ENV];
  processEnvironment.NODE_ENV = environment.NODE_ENV;
  processEnvironment[LOCAL_BUG_REPORT_ARTIFACTS_ENV] =
    environment[LOCAL_BUG_REPORT_ARTIFACTS_ENV];

  try {
    await callback();
  } finally {
    restoreProcessEnvironmentVariable("NODE_ENV", previousNodeEnvironment);
    restoreProcessEnvironmentVariable(
      LOCAL_BUG_REPORT_ARTIFACTS_ENV,
      previousArtifactFlag,
    );
  }
}

function restoreProcessEnvironmentVariable(
  name: string,
  value: string | undefined,
) {
  if (value === undefined) {
    delete (process.env as Record<string, string | undefined>)[name];
  } else {
    (process.env as Record<string, string | undefined>)[name] = value;
  }
}
