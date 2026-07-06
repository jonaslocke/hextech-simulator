import assert from "node:assert/strict";
import { test } from "node:test";
import type { Db } from "mongodb";
import { createMatchRequestSchema } from "../src/shared/game";
import {
  DECK_IDS,
  loadMatchDeckTemplates,
  type DeckId,
} from "../src/server/game";
import type { DeckSnapshot } from "../src/server/game/schemas";

test("accepts and independently loads every playable deck combination", async () => {
  for (const player1 of DECK_IDS) {
    for (const player2 of DECK_IDS) {
      const parsed = createMatchRequestSchema.parse({
        playerDecks: { player1, player2 },
      });
      const loaded: DeckId[] = [];
      const templates = await loadMatchDeckTemplates(
        {} as Db,
        parsed.playerDecks,
        async (_db, deckId) => {
          loaded.push(deckId);
          return snapshot(deckId);
        },
      );

      assert.deepEqual(loaded, [player1, player2]);
      assert.equal(templates[0].catalogDigest, player1);
      assert.equal(templates[1].catalogDigest, player2);
    }
  }
});

test("rejects unknown deck identities", () => {
  assert.equal(
    createMatchRequestSchema.safeParse({
      playerDecks: { player1: "lux", player2: "future-deck" },
    }).success,
    false,
  );
});

function snapshot(deckId: DeckId): DeckSnapshot {
  return {
    sourceText: deckId,
    catalogDigest: deckId,
    entries: [],
    cards: [],
  };
}
