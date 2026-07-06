import assert from "node:assert/strict";
import { test } from "node:test";
import { buildBattlefieldSelectionModel } from "../src/features/match-simulator/battlefield-selection";
import type { GameProjection, ProjectedAction } from "../src/shared/game";

test("preserves battlefield draft identity across unrelated state versions", () => {
  const first = buildBattlefieldSelectionModel({
    actions: [battlefieldAction("state:1:setup:lockBattlefield:bf-1")],
    battlefieldPool: [battlefieldCard("bf-1")],
    matchId: "match-1",
    viewerPlayerId: "player-2",
  });
  const refreshed = buildBattlefieldSelectionModel({
    actions: [battlefieldAction("state:2:setup:lockBattlefield:bf-1")],
    battlefieldPool: [battlefieldCard("bf-1")],
    matchId: "match-1",
    viewerPlayerId: "player-2",
  });

  assert.equal(refreshed.decisionKey, first.decisionKey);
  assert.deepEqual(refreshed.options.map((option) => option.id), ["bf-1"]);
  assert.equal(
    refreshed.actionByBattlefieldId.get("bf-1")?.id,
    "state:2:setup:lockBattlefield:bf-1",
  );
});

test("changes battlefield draft identity when the legal options change", () => {
  const first = buildBattlefieldSelectionModel({
    actions: [battlefieldAction("state:1:setup:lockBattlefield:bf-1")],
    battlefieldPool: [battlefieldCard("bf-1")],
    matchId: "match-1",
    viewerPlayerId: "player-2",
  });
  const invalidated = buildBattlefieldSelectionModel({
    actions: [battlefieldAction("state:2:setup:lockBattlefield:bf-2", "bf-2")],
    battlefieldPool: [battlefieldCard("bf-2")],
    matchId: "match-1",
    viewerPlayerId: "player-2",
  });

  assert.notEqual(invalidated.decisionKey, first.decisionKey);
  assert.deepEqual(invalidated.options.map((option) => option.id), ["bf-2"]);
});

function battlefieldAction(
  id: string,
  sourceCardInstanceId = "bf-1",
): ProjectedAction {
  return {
    disabledReason: null,
    enabled: true,
    id,
    label: "Choose battlefield",
    presentation: {
      prompt: null,
      style: "primary",
      surface: "setup-dialog",
    },
    sourceCardInstanceId,
    targets: [],
  };
}

function battlefieldCard(
  instanceId: string,
): GameProjection["setup"]["battlefieldPool"][number] {
  return {
    computedMight: null,
    damage: 0,
    domains: [],
    energy: null,
    exhausted: false,
    imageUrl: "/battlefield.webp",
    instanceId,
    might: null,
    name: `Battlefield ${instanceId}`,
    ownerPlayerId: "player-2",
    power: null,
    publicCode: `${instanceId}/1`,
    rulesText: "",
    supertype: null,
    type: "Battlefield",
  };
}
