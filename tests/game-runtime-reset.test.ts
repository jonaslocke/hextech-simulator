import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("runtime reset is confirmation-gated and excludes catalog collections", async () => {
  const source = await readFile("scripts/reset-game-runtime.ts", "utf8");
  assert.match(source, /--confirm/);
  for (const collection of [
    "matches",
    "games",
    "gameEvents",
    "deckSnapshots"
  ]) {
    assert.ok(source.includes(`"${collection}"`));
  }
  assert.match(source, /matchId: \{ \$ne: null \}/);
  for (const forbidden of [
    "canonicalCards",
    "behaviorDefinitions",
    "cardBehaviorValidations"
  ]) {
    assert.equal(source.includes(`"${forbidden}"`), false);
  }
});
