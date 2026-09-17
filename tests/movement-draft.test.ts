import assert from "node:assert/strict";
import { test } from "node:test";
import type { BoardModel } from "../src/features/game-board/board-model";
import {
  applyMovementDraftToAnimationData,
  createMovementDraftView,
} from "../src/features/game-board/interactions/movement-draft";
import type { Card } from "../src/features/game-board/types";

function card(
  instanceId: string,
  type = "Unit",
  attachedToCardInstanceId?: string,
): Card {
  return {
    attachedToCardInstanceId,
    img: `${instanceId}.png`,
    instanceId,
    isExhausted: false,
    name: instanceId,
    type,
  };
}

function battlefield(id: string, units: Card[], attachments: Card[] = []) {
  return {
    id,
    playerUnits: units,
    playerAttachments: attachments,
    opponentUnits: [],
    opponentAttachments: [],
  };
}

test("builds one mixed-origin movement draft from projected eligible ids", () => {
  const baseUnit = card("base-unit");
  const equipment = card("equipment", "Gear", "base-unit");
  const gankingUnit = card("ganking-unit");
  const board = {
    player: {
      zones: {
        base: {
          cards: [baseUnit, equipment],
        },
      },
    },
    playerBattlefield: battlefield("origin", [gankingUnit]),
    opponentBattlefield: battlefield("target", []),
  } as unknown as BoardModel;

  const draft = createMovementDraftView({
    board,
    destinationBattlefieldId: "target",
    eligibleUnitIds: ["base-unit", "ganking-unit"],
    selectedUnitIds: ["base-unit", "ganking-unit"],
  });

  assert.deepEqual(draft.originByCardInstanceId.get("base-unit"), {
    kind: "base",
  });
  assert.deepEqual(draft.originByCardInstanceId.get("ganking-unit"), {
    kind: "battlefield",
    battlefieldId: "origin",
  });
  assert.equal(draft.stagedUnits[0]?.stagedUnit.isExhausted, true);
  assert.equal(draft.stagedUnits[1]?.stagedUnit.isExhausted, true);
  assert.equal(baseUnit.isExhausted, false, "staging must not mutate the board model");
  assert.equal(draft.hiddenCardInstanceIds.has("base-unit"), true);
  assert.equal(draft.hiddenCardInstanceIds.has("equipment"), true);
});

test("moves staged unit and attachment placements to the visual destination", () => {
  const baseUnit = card("base-unit");
  const equipment = card("equipment", "Gear", "base-unit");
  const board = {
    player: {
      zones: {
        base: {
          cards: [baseUnit, equipment],
        },
      },
    },
    playerBattlefield: battlefield("origin", []),
    opponentBattlefield: battlefield("target", []),
  } as unknown as BoardModel;
  const draft = createMovementDraftView({
    board,
    destinationBattlefieldId: "target",
    eligibleUnitIds: ["base-unit", "other-unit"],
    selectedUnitIds: ["base-unit"],
  });
  const result = applyMovementDraftToAnimationData(
    {
      placements: [
        {
          attachments: [equipment],
          card: baseUnit,
          layoutIndex: 0,
          ownerPlayerId: "p1",
          zoneId: "p1:base",
          zoneKind: "base",
        },
        {
          card: equipment,
          ownerPlayerId: "p1",
          zoneId: "p1:base",
          zoneKind: "base",
        },
      ],
      zoneCounts: [],
    },
    draft,
  );

  assert.equal(
    result.placements.find((placement) => placement.card.instanceId === "base-unit")?.zoneId,
    "battlefield:target:player",
  );
  assert.equal(
    result.placements.find((placement) => placement.card.instanceId === "equipment")?.zoneId,
    "battlefield:target:player",
  );
  assert.equal(
    result.placements.find((placement) => placement.card.instanceId === "base-unit")?.card.isExhausted,
    true,
  );
  assert.equal(
    result.placements.find((placement) => placement.card.instanceId === "base-unit")?.layoutIndex,
    undefined,
  );
});
