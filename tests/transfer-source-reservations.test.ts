import assert from "node:assert/strict";
import { test } from "node:test";
import type { BoardModel } from "../src/features/game-board/board-model";
import { applyTransferSourceReservations } from "../src/features/game-board/interactions/transfer-source-reservations";
import type { Card } from "../src/features/game-board/types";

function card(instanceId: string, type = "Unit"): Card {
  return {
    img: `${instanceId}.png`,
    instanceId,
    isExhausted: false,
    name: instanceId,
    type,
  };
}

function emptyBattlefield(id: string) {
  return {
    id,
    playerUnits: [],
    playerAttachments: [],
    opponentUnits: [],
    opponentAttachments: [],
  };
}

test("keeps an authoritative Base source slot reserved until transfer completion", () => {
  const board = {
    player: {
      playerId: "p1",
      zones: {
        base: {
          cards: [card("a"), card("c")],
        },
      },
    },
    opponent: {
      playerId: "p2",
      zones: {
        base: { cards: [] },
      },
    },
    playerBattlefield: emptyBattlefield("p1-bf"),
    opponentBattlefield: emptyBattlefield("p2-bf"),
  } as unknown as BoardModel;

  const result = applyTransferSourceReservations(board, [
    {
      attachmentCount: 0,
      cardInstanceId: "b",
      slotIndex: 1,
      sourceExhausted: false,
      zoneId: "p1:base",
    },
  ]);
  const ids = result.board.player.zones.base.cards.map(
    (candidate) => candidate.instanceId,
  );

  assert.equal(ids[0], "a");
  assert.match(ids[1] ?? "", /^__movement-source-placeholder:b:host$/);
  assert.equal(ids[2], "c");
  assert.equal(result.placeholderCardInstanceIds.has(ids[1] ?? ""), true);
});

test("reserves the original battlefield group index with attachment footprint", () => {
  const board = {
    player: {
      playerId: "p1",
      zones: { base: { cards: [] } },
    },
    opponent: {
      playerId: "p2",
      zones: { base: { cards: [] } },
    },
    playerBattlefield: {
      ...emptyBattlefield("source"),
      playerUnits: [card("a"), card("c")],
    },
    opponentBattlefield: emptyBattlefield("target"),
  } as unknown as BoardModel;

  const result = applyTransferSourceReservations(board, [
    {
      attachmentCount: 2,
      cardInstanceId: "b",
      slotIndex: 1,
      sourceExhausted: false,
      zoneId: "battlefield:source:player",
    },
  ]);
  const placeholder = result.board.playerBattlefield.playerUnits[1];
  const attachedPlaceholders =
    result.board.playerBattlefield.playerAttachments.filter(
      (candidate) =>
        candidate.attachedToCardInstanceId === placeholder?.instanceId,
    );

  assert.match(
    placeholder?.instanceId ?? "",
    /^__movement-source-placeholder:b:host$/,
  );
  assert.equal(attachedPlaceholders.length, 2);
  assert.equal(
    attachedPlaceholders.every((candidate) =>
      result.placeholderCardInstanceIds.has(candidate.instanceId ?? ""),
    ),
    true,
  );
});
