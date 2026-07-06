import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import {
  actionsForSource,
  chainOverlayZone,
  moveSelectionTitle,
  showdownPromptState,
  simultaneousMoveAction
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
    showdownPromptState({
      chain: null,
      showdown,
      viewerPlayerId: "p1"
    })?.hasFocus,
    true
  );
  assert.equal(
    showdownPromptState({
      chain: null,
      showdown,
      viewerPlayerId: "p2"
    })?.hasFocus,
    false
  );
  assert.equal(
    showdownPromptState({
      chain: null,
      showdown: null,
      viewerPlayerId: "p1"
    }),
    null
  );
  const closed = showdownPromptState({
    chain: {
      items: [],
      relevantPlayerIds: ["p1", "p2"],
      priorityPlayerId: "p2",
      passedPlayerIds: []
    },
    showdown,
    viewerPlayerId: "p1"
  });
  assert.equal(closed?.hasFocus, true);
  assert.equal(closed?.hasPriority, false);
  assert.equal(closed?.isClosed, true);
  assert.equal(closed?.canPassFocus, false);
  assert.equal(closed?.priorityPlayerId, "p2");
});

test("describes the final combat Focus pass with live Might", () => {
  const card = (
    instanceId: string,
    ownerPlayerId: string,
    might: number
  ) => ({
    instanceId,
    ownerPlayerId,
    name: instanceId,
    imageUrl: null,
    rulesText: "",
    publicCode: `${instanceId}/1`,
    type: "Unit",
    supertype: null,
    domains: [],
    energy: 0,
    might,
    power: 0,
    computedMight: might,
    damage: 0,
    exhausted: false
  });
  const showdown = {
    kind: "combat" as const,
    battlefieldId: "arena",
    relevantPlayerIds: ["p1", "p2"],
    focusPlayerId: "p2",
    priorityPlayerId: null,
    passedPlayerIds: ["p1"]
  };
  const prompt = showdownPromptState({
    battlefields: [{
      battlefieldId: "arena",
      selectedByPlayerId: "p2",
      controllerPlayerId: "p2",
      contestedByPlayerId: "p1",
      card: {
        ...card("arena-card", "p2", 0),
        type: "Battlefield"
      },
      units: [
        card("attacker", "p1", 5),
        card("defender", "p2", 3)
      ],
      facedownCard: null
    }],
    chain: null,
    combat: {
      battlefieldId: "arena",
      stage: "showdown",
      attackerPlayerId: "p1",
      defenderPlayerId: "p2",
      attackerUnitIds: ["attacker"],
      defenderUnitIds: ["defender"],
      attackerMight: null,
      defenderMight: null
    },
    pendingChoice: null,
    showdown,
    viewerPlayerId: "p2"
  });

  assert.equal(prompt?.isFinalFocusPass, true);
  assert.equal(prompt?.attackerMight, 5);
  assert.equal(prompt?.defenderMight, 3);
  assert.equal(prompt?.canPassFocus, true);

  const blocked = showdownPromptState({
    chain: null,
    pendingChoice: {
      type: "orderTriggers",
      id: "choice",
      playerId: "p1",
      prompt: "Order triggers",
      optionIds: [],
      pendingChainItems: []
    },
    showdown,
    viewerPlayerId: "p2"
  });
  assert.equal(blocked?.canPassFocus, false);
});

test("stages a single-unit move through the simultaneous move action", () => {
  const singleMove: ProjectedAction = {
    id: "game:1:action:move:unit-a:battlefield",
    label: "Move to Arena",
    sourceCardInstanceId: "unit-a",
    enabled: true,
    disabledReason: null,
    targets: [],
    presentation: {
      surface: "card-menu",
      style: "primary",
      prompt: null
    }
  };
  const simultaneousMove: ProjectedAction = {
    id: "game:1:action:moveMany:_:battlefield",
    label: "Move units to Arena",
    sourceCardInstanceId: null,
    enabled: true,
    disabledReason: null,
    targets: [{
      kind: "card",
      legalIds: ["unit-a", "unit-b"],
      minimum: 1,
      maximum: 2
    }],
    presentation: {
      surface: "action-rail",
      style: "primary",
      prompt: null
    }
  };
  assert.equal(
    simultaneousMoveAction(
      [singleMove, simultaneousMove],
      singleMove,
      "unit-a"
    ),
    simultaneousMove
  );
  assert.equal(
    moveSelectionTitle(simultaneousMove, [{
      battlefieldId: "battlefield",
      card: { name: "The Papertree" },
      units: []
    }]),
    "Choose units to Conquer The Papertree"
  );
  assert.equal(
    moveSelectionTitle(simultaneousMove, [{
      battlefieldId: "battlefield",
      card: { name: "The Papertree" },
      units: [{}]
    }]),
    "Choose units to Contest The Papertree"
  );
});

test("closes the chain overlay only when the final resolving item leaves", () => {
  assert.equal(chainOverlayZone(null, false, true), "chain");
  assert.equal(chainOverlayZone("chain", true, false), null);
  assert.equal(
    chainOverlayZone("chain", false, false),
    "chain",
    "an empty chain may still be opened for inspection",
  );
  assert.equal(chainOverlayZone("log", true, false), "log");
});

test("game board contains no initial-deck or behavior identities", async () => {
  const root = path.join(process.cwd(), "src", "features", "game-board");
  const files = await collect(root);
  const source = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
  const forbidden = [
    "Lux,", "Stupefy", "Back to Back", "Falling Comet", "Blast of Power",
    "Singularity", "Final Spark", "behaviorId", "getTargetConfig",
    "lux-crownguard", "Annie,", "Dark Child", "Firestorm", "Tibbers",
    "Mystic Poro", "Pouty Poro", "Traveling Merchant"
  ];
  assert.deepEqual(forbidden.filter((value) => source.includes(value)), []);
});

test("keeps large rune rows inside a horizontally scrollable zone", async () => {
  const playerBoard = await readFile(
    path.join(
      process.cwd(),
      "src",
      "features",
      "game-board",
      "components",
      "player-board.tsx"
    ),
    "utf8"
  );

  assert.match(
    playerBoard,
    /cards=\{baseRunes\}[\s\S]*?layout="scroll"/,
  );
  assert.match(
    playerBoard,
    /layout === "scroll"[\s\S]*?overflow-x-auto overflow-y-hidden/,
  );
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
