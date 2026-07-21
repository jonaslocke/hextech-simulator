import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import {
  actionsForSource,
  activeTargetRequirement,
  appendTargetSelections,
  chainOverlayOpen,
  chainAutoPassShouldReset,
  combineTargetRequirements,
  moveSelectionTitle,
  showdownPromptState,
  simultaneousMoveAction,
  targetSelectionCanAdd,
  targetSelectionIsLegal,
  toggleMovementSelection,
} from "../src/features/game-board/model";
import { deduplicateProjectedCardViews } from "../src/features/game-board/board-view-model";
import type { ProjectedCardView } from "../src/shared/game";

test("keeps enriched card state when a stripped chain view shares its instance", () => {
  const card = (activeModifiers?: ProjectedCardView["activeModifiers"]): ProjectedCardView => ({
    instanceId: "SYN-CARD-INSTANCE",
    ownerPlayerId: "p1",
    name: "Synthetic Unit",
    imageUrl: null,
    rulesText: "",
    publicCode: "SYN-001/001",
    type: "Unit",
    supertype: null,
    domains: [],
    energy: 1,
    might: 4,
    power: null,
    computedMight: 5,
    damage: 0,
    exhausted: true,
    stunned: false,
    activeModifiers,
  });
  const enriched = card([{ label: "Buff +1", duration: "Until leaving board" }]);
  const stripped = card([]);

  assert.deepEqual(
    deduplicateProjectedCardViews([enriched, stripped]),
    [enriched],
  );
  assert.deepEqual(
    deduplicateProjectedCardViews([stripped, enriched]),
    [enriched],
  );
});

test("auto-pass resets synchronously when a new chain item appears", () => {
  assert.equal(
    chainAutoPassShouldReset({
      currentChainItemIds: ["existing"],
      isOpen: true,
      previousChainItemIds: ["existing"],
      wasOpen: true,
    }),
    false,
  );
  assert.equal(
    chainAutoPassShouldReset({
      currentChainItemIds: ["existing", "new-trigger"],
      isOpen: true,
      previousChainItemIds: ["existing"],
      wasOpen: true,
    }),
    true,
  );
});
import { responsiveCardHeight } from "../src/features/game-board/card-sizing";
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

test("stages independently presented target groups without inflating the active count", () => {
  const requirement = combineTargetRequirements(
    {
      id: "state:1:action:synthetic",
      label: "Synthetic activated ability",
      sourceCardInstanceId: "source",
      enabled: true,
      disabledReason: null,
      targets: [
        {
          kind: "card",
          legalIds: ["hand-a", "hand-b"],
          minimum: 1,
          maximum: 1,
          selectionKey: "payment",
          sourceZone: "hand",
        },
        {
          kind: "card",
          legalIds: ["unit-a", "unit-b"],
          minimum: 1,
          maximum: 1,
          selectionKey: "subject",
        },
      ],
      presentation: {
        surface: "card-menu",
        style: "primary",
        prompt: null,
      },
    },
    "card",
  );

  assert.ok(requirement);
  assert.equal(activeTargetRequirement(requirement, [])?.maximum, 1);
  const afterPayment = appendTargetSelections(requirement, [], ["hand-a"]);
  assert.deepEqual(afterPayment, ["hand-a"]);
  assert.deepEqual(activeTargetRequirement(requirement, afterPayment!)?.legalIds, [
    "unit-a",
    "unit-b",
  ]);
  assert.deepEqual(
    appendTargetSelections(requirement, afterPayment!, ["unit-b"]),
    ["hand-a", "unit-b"],
  );
  assert.equal(
    appendTargetSelections(requirement, [], ["hand-a", "hand-b"]),
    null,
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
      facedownCards: [],
      facedownCardCount: 0,
      facedownCard: null,
      hasFacedownCard: false,
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
      card: { name: "Synthetic Battlefield" },
      units: []
    }]),
    "Move units to Synthetic Battlefield"
  );
  assert.equal(
    moveSelectionTitle(simultaneousMove, [{
      battlefieldId: "battlefield",
      card: { name: "Synthetic Battlefield" },
      units: [{}]
    }]),
    "Move units to Synthetic Battlefield"
  );
});

test("movement selections toggle unique Units while preserving the minimum", () => {
  assert.deepEqual(toggleMovementSelection([], "unit-a", 1), ["unit-a"]);
  assert.deepEqual(
    toggleMovementSelection(["unit-a"], "unit-a", 1),
    ["unit-a"],
  );
  assert.deepEqual(
    toggleMovementSelection(["unit-a"], "unit-b", 1),
    ["unit-a", "unit-b"],
  );
  assert.deepEqual(
    toggleMovementSelection(["unit-a", "unit-b"], "unit-a", 1),
    ["unit-b"],
  );
  assert.deepEqual(
    toggleMovementSelection(["unit-a", "unit-a"], "unit-a", 1),
    ["unit-a"],
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
