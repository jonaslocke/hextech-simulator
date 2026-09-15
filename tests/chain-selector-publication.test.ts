import assert from "node:assert/strict";
import { test } from "node:test";
import { createBehaviorContext } from "../src/server/game";
import { createPrimitiveHandlers, createRuntimeCardIndex } from "../src/server/game/primitive-handlers";
import { chainSelectorFixture, chooserSourceId, ownChainId, opponentChainId } from "./helpers/chain-selector-fixture";

test("published counter selectors preserve the controller qualification in source text", async () => {
  const { game, decks } = await chainSelectorFixture();
  const handlers = createPrimitiveHandlers(createRuntimeCardIndex(decks, game));
  const seen = new Set<string>();
  for (const definition of decks[0]!.snapshot.cards) {
    for (const clause of definition.behaviorModel.clauses) {
      for (const selector of clause.selectors.filter((binding) => binding.behaviorId === "selector.chain_item")) {
        // Catalog invariant for the supported counter sentence forms; the game
        // runtime never infers legality from raw rules text.
        const match = clause.sourceText.match(/\bCounter (?:a|an) (?:(enemy|friendly) )?spell\b/i);
        assert.ok(match, `Unclassified counter sentence: ${clause.sourceText}`);
        const qualification = match[1]?.toLowerCase() ?? "unqualified";
        seen.add(qualification);
        const expected = qualification === "enemy" ? [opponentChainId] : qualification === "friendly" ? [ownChainId] : [ownChainId, opponentChainId];
        const requirement = handlers.get(selector.behaviorId)!.targets!(selector, createBehaviorContext(game, "p1", chooserSourceId, null, []));
        assert.deepEqual(requirement.legalIds, expected, `${definition.cardCode}: ${clause.sourceText}`);
      }
    }
  }
  assert.ok(seen.has("unqualified"));
  assert.ok(seen.has("enemy"));
});
