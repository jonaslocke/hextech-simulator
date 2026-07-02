import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { gameStateSchema } from "../src/server/game/state";

test("characterizes the pre-implementation showdown shell", async () => {
  const actionsSource = await readFile("src/server/game/actions.ts", "utf8");
  const stateSource = await readFile("src/server/game/state.ts", "utf8");

  assert.match(actionsSource, /Only movement to an empty battlefield is supported/);
  assert.match(stateSource, /showdown: z\.object\(\{\s*battlefieldId:[\s\S]*priorityPlayerId:/);
  assert.doesNotMatch(stateSource, /combat: z\.object/);
  assert.doesNotMatch(stateSource, /controllerPlayerId: z\.string\(\)\.nullable/);

  const result = gameStateSchema.safeParse({});
  assert.equal(result.success, false);
});

test("records the controlling showdown rules and non-combat interpretation", async () => {
  const ledger = await readFile("docs/showdown-rules-decision-ledger.md", "utf8");

  for (const rule of ["508-510", "511-513", "518-526", "532-544", "545-553", "620-625", "626", "627-628", "629-633"]) {
    assert.ok(ledger.includes(rule), `missing rules ledger entry for ${rule}`);
  }
  assert.match(ledger, /gains Control, Contested clears, and Conquer\/Score/);
});
