import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { actionsForSource } from "../src/features/game-board-v2/model";
import type { ProjectedAction } from "../src/shared/game-v2";

test("groups opaque projected actions without card-specific rules", () => {
  const actions: ProjectedAction[] = [
    { id: "state:1:action:a", label: "First action", sourceCardInstanceId: "card-a", enabled: true, disabledReason: null, targets: [], presentation: { surface: "card-menu", style: "primary", prompt: null } },
    { id: "state:1:action:b", label: "Second action", sourceCardInstanceId: "card-b", enabled: false, disabledReason: "Unavailable", targets: [{ kind: "card", legalIds: ["card-a"], minimum: 1, maximum: 1 }], presentation: { surface: "card-menu", style: "primary", prompt: null } },
    { id: "state:1:pass", label: "Pass", sourceCardInstanceId: null, enabled: true, disabledReason: null, targets: [], presentation: { surface: "action-rail", style: "secondary", prompt: null } }
  ];
  assert.deepEqual(actionsForSource(actions, "card-a"), [actions[0]]);
  assert.deepEqual(actionsForSource(actions, "card-b"), [actions[1]]);
  assert.deepEqual(actionsForSource(actions, null), [actions[2]]);
});

test("game board v2 contains no initial-deck or behavior identities", async () => {
  const root = path.join(process.cwd(), "src", "features", "game-board-v2");
  const files = await collect(root);
  const source = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
  const forbidden = [
    "Lux,", "Stupefy", "Back to Back", "Falling Comet", "Blast of Power",
    "Singularity", "Final Spark", "behaviorId", "getTargetConfig",
    "lux-crownguard"
  ];
  assert.deepEqual(forbidden.filter((value) => source.includes(value)), []);
});

test("game board v2 preserves the legacy presentation component structure", async () => {
  const legacyRoot = path.join(process.cwd(), "src", "features", "game-board", "components");
  const v2Root = path.join(process.cwd(), "src", "features", "game-board-v2", "components");
  const copiedComponents = [
    "action-button.tsx", "action-rail.tsx", "battlefield-board.tsx", "board-slot.tsx",
    "card-zone-transfer-overlay.tsx", "empty-state.tsx", "player-board.tsx",
    "score-header.tsx", "score-track.tsx", "temporary-zone-overlay.tsx",
    "zone-area.tsx"
  ];
  for (const file of copiedComponents) {
    const legacy = await readFile(path.join(legacyRoot, file), "utf8");
    const v2 = await readFile(path.join(v2Root, file), "utf8");
    const legacyMarkup = normalizeLineEndings(legacy.slice(legacy.indexOf("export "))).trimEnd();
    const v2Markup = normalizeLineEndings(v2.slice(v2.indexOf("export "))).trimEnd();
    if (file === "temporary-zone-overlay.tsx") {
      assert.equal(normalizeLogType(v2Markup), normalizeLogType(legacyMarkup), file);
    } else {
      assert.equal(v2Markup, legacyMarkup, file);
    }
  }
});

function normalizeLogType(value: string) {
  return value.replaceAll("GameLogEntryV2", "GameLogEntry");
}

function normalizeLineEndings(value: string) {
  return value.replaceAll("\r\n", "\n");
}

async function collect(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await collect(fullPath));
    else if (/\.tsx?$/.test(fullPath)) files.push(fullPath);
  }
  return files;
}
