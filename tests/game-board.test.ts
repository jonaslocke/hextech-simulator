import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import {
  actionsForSource,
  showdownPromptState
} from "../src/features/game-board/model";
import type { ProjectedAction } from "../src/shared/game";

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

test("derives active and waiting showdown prompts from Focus", () => {
  const showdown = {
    kind: "nonCombat" as const,
    battlefieldId: "battlefield",
    relevantPlayerIds: ["p1", "p2"],
    focusPlayerId: "p1",
    priorityPlayerId: null,
    passedPlayerIds: []
  };
  assert.equal(
    showdownPromptState({ showdown, viewerPlayerId: "p1" })?.hasFocus,
    true
  );
  assert.equal(
    showdownPromptState({ showdown, viewerPlayerId: "p2" })?.hasFocus,
    false
  );
  assert.equal(
    showdownPromptState({ showdown: null, viewerPlayerId: "p1" }),
    null
  );
});

test("game board contains no initial-deck or behavior identities", async () => {
  const root = path.join(process.cwd(), "src", "features", "game-board");
  const files = await collect(root);
  const source = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
  const forbidden = [
    "Lux,", "Stupefy", "Back to Back", "Falling Comet", "Blast of Power",
    "Singularity", "Final Spark", "behaviorId", "getTargetConfig",
    "lux-crownguard"
  ];
  assert.deepEqual(forbidden.filter((value) => source.includes(value)), []);
});

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
