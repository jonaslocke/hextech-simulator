import assert from "node:assert/strict";
import { test } from "node:test";
import {
  boardLocationTransferNeedsDestinationRect,
  exactPlacementCandidateIndex,
} from "../src/features/game-board/components/card-zone-transfer-geometry";

test("board transfer geometry never falls back to the same card in its origin zone", () => {
  assert.equal(
    exactPlacementCandidateIndex("battlefield:target:player", ["p1:base"]),
    -1,
  );
  assert.equal(
    exactPlacementCandidateIndex("battlefield:target:player", [
      "p1:base",
      "battlefield:target:player",
    ]),
    1,
  );
});

test("first staged board move waits for its real destination geometry", () => {
  assert.equal(
    boardLocationTransferNeedsDestinationRect({
      fromZoneId: "p1:base",
      fromZoneKind: "base",
      hasDestinationRect: false,
      toZoneId: "battlefield:target:player",
      toZoneKind: "battlefield",
    }),
    true,
  );
  assert.equal(
    boardLocationTransferNeedsDestinationRect({
      fromZoneId: "p1:base",
      fromZoneKind: "base",
      hasDestinationRect: true,
      toZoneId: "battlefield:target:player",
      toZoneKind: "battlefield",
    }),
    false,
  );
});
