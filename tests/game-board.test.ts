import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import {
  actionsForSource,
  chainOverlayOpen,
  combineTargetRequirements,
  groupedTargetRequirements,
  moveSelectionTitle,
  showdownPromptState,
  simultaneousMoveAction,
  targetSelectionCanAdd,
  targetSelectionIsLegal
} from "../src/features/game-board/model";
import { responsiveCardHeight } from "../src/features/game-board/card-sizing";
import {
  rebindStagedSelection,
  type BoardTargetSelection,
  withSelectedTargetIds,
} from "../src/features/game-board/interactions/use-board-target-selection";
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

test("combines and validates selector-bound targets for one action", () => {
  const action: ProjectedAction = {
    id: "state:1:play:duel",
    label: "Play Gentlemen's Duel",
    sourceCardInstanceId: "duel",
    enabled: true,
    disabledReason: null,
    targets: [
      {
        kind: "card",
        legalIds: ["friendly-a", "friendly-b"],
        minimum: 1,
        maximum: 1,
        selectionKey: "friendly",
      },
      {
        kind: "card",
        legalIds: ["enemy-a", "enemy-b"],
        minimum: 1,
        maximum: 1,
        selectionKey: "enemy",
      },
    ],
    presentation: {
      surface: "card-menu",
      style: "primary",
      prompt: null,
    },
  };
  const requirement = combineTargetRequirements(action, "card");

  assert.ok(requirement);
  assert.equal(requirement.minimum, 2);
  assert.equal(requirement.maximum, 2);
  assert.deepEqual(requirement.legalIds, [
    "friendly-a",
    "friendly-b",
    "enemy-a",
    "enemy-b",
  ]);
  assert.equal(
    targetSelectionCanAdd(requirement, ["friendly-a"], "enemy-a"),
    true,
  );
  assert.equal(
    targetSelectionCanAdd(requirement, ["friendly-a"], "friendly-b"),
    false,
  );
  assert.equal(
    targetSelectionIsLegal(requirement, ["friendly-a", "enemy-a"]),
    true,
  );
  assert.equal(
    targetSelectionIsLegal(requirement, ["friendly-a", "friendly-b"]),
    false,
  );
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
      facedownCard: null,
      facedownCardPresent: false
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

test("submits an immediate move when the destination has only one eligible unit", () => {
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
      prompt: null,
    },
  };
  const singleParticipantMoveMany: ProjectedAction = {
    id: "game:1:action:moveMany:_:battlefield",
    label: "Move units to Arena",
    sourceCardInstanceId: null,
    enabled: true,
    disabledReason: null,
    targets: [{
      kind: "card",
      legalIds: ["unit-a"],
      minimum: 1,
      maximum: 1,
    }],
    presentation: {
      surface: "action-rail",
      style: "primary",
      prompt: null,
    },
  };

  assert.equal(
    simultaneousMoveAction(
      [singleMove, singleParticipantMoveMany],
      singleMove,
      "unit-a",
    ),
    null,
  );
});

test("closes the chain overlay only when the final resolving item leaves", () => {
  assert.equal(chainOverlayOpen(false, false, true), true);
  assert.equal(chainOverlayOpen(true, true, false), false);
  assert.equal(
    chainOverlayOpen(true, false, false),
    true,
    "an empty chain may still be opened for inspection",
  );
});

test("card sizing scales from viewport height within stable thresholds", () => {
  assert.equal(responsiveCardHeight("md", 1440), 120);
  assert.equal(responsiveCardHeight("md", 982), 88);
  assert.equal(responsiveCardHeight("md", 768), 88);
  assert.equal(responsiveCardHeight("lg", 1440), 144);
  assert.equal(responsiveCardHeight("lg", 982), 108);
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

test("renders Rune rows as a contained single-row fan", async () => {
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
    /cards=\{baseRunes\}[\s\S]*?layout="fan"/,
  );
  assert.match(
    playerBoard,
    /function RuneFan[\s\S]*?resolveRuneFan[\s\S]*?overflow-hidden/,
  );
});

test("preserves the active grouped target selection when rebinding projected actions", () => {
  const action: ProjectedAction = {
    id: "state:1:play:grouped",
    label: "Play grouped spell",
    sourceCardInstanceId: "spell",
    enabled: true,
    disabledReason: null,
    targets: [
      {
        kind: "card",
        legalIds: ["unit-a", "unit-b"],
        minimum: 0,
        maximum: 3,
        selectionGroup: "execution:0",
      },
      {
        kind: "card",
        legalIds: ["unit-a", "unit-b"],
        minimum: 0,
        maximum: 3,
        selectionGroup: "execution:1",
      },
    ],
    presentation: {
      surface: "card-menu",
      style: "primary",
      prompt: null,
    },
  };
  const targetGroups = groupedTargetRequirements(action, "card");
  const initialSelection: BoardTargetSelection = {
    actionId: action.id,
    activeTargetGroupIndex: 0,
    legalTargetIds: ["unit-a", "unit-b"],
    maxTargets: 3,
    minTargets: 0,
    purpose: "play",
    requirement: targetGroups[0]!.requirement,
    selectedTargetIds: [],
    selectedTargetIdsByGroup: {},
    targetGroups,
    targetKind: "card",
  };

  const selectionAfterBoardClick = withSelectedTargetIds(
    initialSelection,
    ["unit-a"],
  );
  const rebound = rebindStagedSelection(selectionAfterBoardClick, action);

  assert.deepEqual(rebound.selectedTargetIds, ["unit-a"]);
  assert.equal(targetSelectionIsLegal(rebound.requirement, rebound.selectedTargetIds), true);

  const selectionAfterDeselect = withSelectedTargetIds(rebound, []);
  assert.deepEqual(
    rebindStagedSelection(selectionAfterDeselect, action).selectedTargetIds,
    [],
  );
});

test("routes owned Trash pointer activation through the projected play menu", async () => {
  const overlay = await readFile(
    path.join(
      process.cwd(),
      "src",
      "features",
      "game-board",
      "components",
      "temporary-zone-overlay.tsx",
    ),
    "utf8",
  );
  const board = await readFile(
    path.join(process.cwd(), "src", "features", "game-board", "game-board.tsx"),
    "utf8",
  );

  assert.match(
    overlay,
    /openZone === "playerTrash"[\s\S]*?onCardContextAction=\{onCardContextAction\}[\s\S]*?onCardPrimaryAction=\{onCardPrimaryAction\}/,
  );
  assert.match(
    overlay,
    /onPrimaryAction=\{\s*onCardPrimaryAction\s*\?\s*\(event\) => onCardPrimaryAction\(card, event\)/,
  );
  const opponentTrash = overlay.match(/openZone === "opponentTrash" \? \([\s\S]*?\) : \(/)?.[0];
  assert.ok(opponentTrash);
  assert.doesNotMatch(opponentTrash, /onCardContextAction|onCardPrimaryAction/);
  assert.match(
    board,
    /<TemporaryZoneOverlay[\s\S]*?onCardPrimaryAction=\{\s*isInteractionSuspended \|\| isMovementDraftActive\s*\? undefined\s*: \(card, event\) =>\s*event\s*\? handleCardContextFromHand\(card, event\)\s*: handlePlayCardFromHand\(card\)/,
  );
});

test("play menu renders projected Flow and Repeat markers with keyword assets", async () => {
  const label = await readFile(
    path.join(
      process.cwd(),
      "src",
      "features",
      "game-board",
      "components",
      "playable-card-menu-label.tsx",
    ),
    "utf8",
  );
  const keywordAssets = await readFile(
    path.join(
      process.cwd(),
      "src",
      "features",
      "card-presentation",
      "lib",
      "keyword-assets.ts",
    ),
    "utf8",
  );

  assert.ok(label.includes("const markers = /\\[(Flow|Repeat)\\]/g;"));
  assert.ok(label.includes('part === "Flow" ? "flow" : "repeat"'));
  assert.match(label, /getKeywordImagePath\([\s\S]*?"md"/);
  assert.match(keywordAssets, /flow: \{ md: flow64, lg: flow128 \}/);
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
