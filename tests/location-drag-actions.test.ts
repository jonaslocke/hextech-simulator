import assert from "node:assert/strict";
import { test } from "node:test";
import type { ProjectedAction } from "../src/shared/game";
import {
  boardDropLocationFromId,
  boardDropLocationId,
  findLocationDragActionForDrop,
  legalDropLocationsForCard,
  locationDragCandidatesForCard,
  movementDraftDropIntent,
  movementDraftLegalDropLocationsForCard,
  sameBoardLocation,
  type BoardDropLocation,
  type MovementDraftDragContext,
} from "../src/features/game-board/drag-and-drop/location-drag-actions";

function makeAction(input: {
  destination?: ProjectedAction["presentation"]["boardLocation"];
  enabled?: boolean;
  kind: string;
  sourceCardInstanceId?: string | null;
}): ProjectedAction {
  const sourceCardInstanceId = input.sourceCardInstanceId ?? "unit-1";
  const extra =
    input.destination?.kind === "base"
      ? "base"
      : input.destination?.kind === "battlefield"
        ? input.destination.battlefieldId
        : undefined;
  const idParts = [
    "game",
    "1",
    "action",
    input.kind,
    sourceCardInstanceId ? encodeURIComponent(sourceCardInstanceId) : "_",
  ];

  if (extra) {
    idParts.push(encodeURIComponent(extra));
  }

  return {
    id: idParts.join(":"),
    label: input.kind,
    sourceCardInstanceId,
    enabled: input.enabled ?? true,
    disabledReason: input.enabled === false ? "Unavailable." : null,
    targets: [],
    presentation: {
      surface: "card-menu",
      style: "primary",
      prompt: null,
      boardLocation: input.destination ?? null,
    },
  };
}

test("finds enabled move actions for board unit drag", () => {
  const destination: BoardDropLocation = {
    kind: "battlefield",
    battlefieldId: "bf-1",
  };
  const action = makeAction({
    kind: "move",
    destination,
  });
  const candidates = locationDragCandidatesForCard({
    actions: [
      action,
      makeAction({ kind: "play", destination }),
      makeAction({ kind: "move", destination, enabled: false }),
      makeAction({ kind: "moveMany", destination }),
      makeAction({ kind: "move" }),
    ],
    sourceCardInstanceId: "unit-1",
    sourceLocation: { kind: "base" },
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.action.id, action.id);
  assert.deepEqual(
    legalDropLocationsForCard({
      actions: [action],
      sourceCardInstanceId: "unit-1",
      sourceLocation: { kind: "base" },
    }),
    [destination],
  );
});

test("finds enabled play actions for champion zone drag", () => {
  const destination: BoardDropLocation = { kind: "base" };
  const playAction = makeAction({
    kind: "play",
    sourceCardInstanceId: "champion-1",
    destination,
  });

  const found = findLocationDragActionForDrop({
    actions: [
      playAction,
      makeAction({
        kind: "move",
        sourceCardInstanceId: "champion-1",
        destination,
      }),
    ],
    destination,
    sourceCardInstanceId: "champion-1",
    sourceLocation: { kind: "champion" },
  });

  assert.equal(found?.id, playAction.id);
});

test("does not use champion play actions for board unit drag", () => {
  const destination: BoardDropLocation = { kind: "base" };
  const found = findLocationDragActionForDrop({
    actions: [
      makeAction({
        kind: "play",
        sourceCardInstanceId: "unit-1",
        destination,
      }),
    ],
    destination,
    sourceCardInstanceId: "unit-1",
    sourceLocation: {
      kind: "battlefield",
      battlefieldId: "bf-1",
    },
  });

  assert.equal(found, null);
});

test("matches board locations by kind and battlefield id", () => {
  assert.equal(sameBoardLocation({ kind: "base" }, { kind: "base" }), true);
  assert.equal(
    sameBoardLocation(
      { kind: "battlefield", battlefieldId: "bf-1" },
      { kind: "battlefield", battlefieldId: "bf-1" },
    ),
    true,
  );
  assert.equal(
    sameBoardLocation(
      { kind: "battlefield", battlefieldId: "bf-1" },
      { kind: "battlefield", battlefieldId: "bf-2" },
    ),
    false,
  );
});

test("serializes and parses board drop location ids", () => {
  assert.deepEqual(
    boardDropLocationFromId(boardDropLocationId({ kind: "base" })),
    { kind: "base" },
  );

  assert.deepEqual(
    boardDropLocationFromId(
      boardDropLocationId({
        kind: "battlefield",
        battlefieldId: "battlefield:with:colon",
      }),
    ),
    {
      kind: "battlefield",
      battlefieldId: "battlefield:with:colon",
    },
  );

  assert.equal(boardDropLocationFromId("other:base"), null);
});

test("movement draft only lets eligible unstaged units move to its destination", () => {
  const destination: BoardDropLocation = {
    kind: "battlefield",
    battlefieldId: "target",
  };
  const context: MovementDraftDragContext = {
    destination,
    eligibleCardInstanceIds: new Set(["base-unit", "ganking-unit"]),
    originByCardInstanceId: new Map([
      ["base-unit", { kind: "base" }],
      [
        "ganking-unit",
        { kind: "battlefield", battlefieldId: "origin" },
      ],
    ]),
    stagedCardInstanceIds: new Set(["base-unit"]),
  };

  assert.deepEqual(
    movementDraftLegalDropLocationsForCard({
      movementDraft: context,
      sourceCardInstanceId: "ganking-unit",
    }),
    [destination],
  );
  assert.equal(
    movementDraftDropIntent({
      destination,
      movementDraft: context,
      sourceCardInstanceId: "ganking-unit",
    }),
    "stage",
  );
  assert.deepEqual(
    movementDraftLegalDropLocationsForCard({
      movementDraft: context,
      sourceCardInstanceId: "ineligible-unit",
    }),
    [],
  );
});

test("movement draft only lets a staged unit return to its recorded origin", () => {
  const context: MovementDraftDragContext = {
    destination: { kind: "battlefield", battlefieldId: "target" },
    eligibleCardInstanceIds: new Set(["base-unit", "ganking-unit"]),
    originByCardInstanceId: new Map([
      ["base-unit", { kind: "base" }],
      [
        "ganking-unit",
        { kind: "battlefield", battlefieldId: "origin" },
      ],
    ]),
    stagedCardInstanceIds: new Set(["base-unit", "ganking-unit"]),
  };

  assert.deepEqual(
    movementDraftLegalDropLocationsForCard({
      movementDraft: context,
      sourceCardInstanceId: "base-unit",
    }),
    [{ kind: "base" }],
  );
  assert.equal(
    movementDraftDropIntent({
      destination: { kind: "base" },
      movementDraft: context,
      sourceCardInstanceId: "base-unit",
    }),
    "unstage",
  );
  assert.equal(
    movementDraftDropIntent({
      destination: { kind: "battlefield", battlefieldId: "other" },
      movementDraft: context,
      sourceCardInstanceId: "ganking-unit",
    }),
    null,
  );
});
