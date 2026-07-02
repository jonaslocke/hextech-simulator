import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { gameStateSchema } from "../src/server/game/state";
import { currentTiming } from "../src/server/game/timing";
import type { GameDocument } from "../src/server/game/state";

test("characterizes the separated showdown timing kernel", async () => {
  const actionsSource = await readFile("src/server/game/actions.ts", "utf8");
  const stateSource = await readFile("src/server/game/state.ts", "utf8");

  assert.match(actionsSource, /startCombat/);
  assert.match(stateSource, /showdown: z\.object\(\{[\s\S]*focusPlayerId:/);
  assert.doesNotMatch(
    stateSource.match(/showdown: z\.object\(\{[\s\S]*?\}\)\.nullable\(\)/)?.[0] ?? "",
    /priorityPlayerId/
  );
  assert.match(stateSource, /chain: z\.object\(\{[\s\S]*priorityPlayerId:/);
  assert.match(stateSource, /combat: z\.object/);
  assert.match(stateSource, /controllerPlayerId: z\.string\(\)\.nullable/);
  assert.match(stateSource, /contestedByPlayerId: z\.string\(\)\.nullable/);

  const result = gameStateSchema.safeParse({});
  assert.equal(result.success, false);
  const game = {
    state: { showdown: null, chain: null }
  } as unknown as GameDocument;
  assert.equal(currentTiming(game), "neutralOpen");
  game.state.showdown = {
    kind: "nonCombat",
    battlefieldId: "bf",
    relevantPlayerIds: ["p1", "p2"],
    focusPlayerId: "p1",
    passedPlayerIds: []
  };
  assert.equal(currentTiming(game), "showdownOpen");
  game.state.chain = {
    items: [],
    relevantPlayerIds: ["p1", "p2"],
    priorityPlayerId: "p2",
    passedPlayerIds: []
  };
  assert.equal(currentTiming(game), "showdownClosed");
});

test("records the controlling showdown rules and non-combat interpretation", async () => {
  const ledger = await readFile("docs/showdown-rules-decision-ledger.md", "utf8");

  for (const rule of ["508-510", "511-513", "518-526", "532-544", "545-553", "620-625", "626", "627-628", "629-633"]) {
    assert.ok(ledger.includes(rule), `missing rules ledger entry for ${rule}`);
  }
  assert.match(ledger, /gains Control, Contested clears, and Conquer\/Score/);
});
