import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  buildCanonicalCardDocument,
  buildCurrentBehaviorCatalog,
} from "../src/server/card-catalog";
import { buildOrnnCanonicalPublication } from "../src/server/card-catalog/ornn-canonical-publications";
import { loadSourceCardCatalog } from "../src/server/catalog";

test("canonical publication compiles the self-movement draw contract", async () => {
  const [catalog, behaviorCatalog] = await Promise.all([
    loadSourceCardCatalog(),
    buildCurrentBehaviorCatalog(),
  ]);
  const card = catalog.byPublicCode.get("SFD-048/221");
  assert.ok(card);

  const document = buildCanonicalCardDocument(
    buildOrnnCanonicalPublication(card),
    behaviorCatalog,
    "2026-09-22T00:00:00.000Z",
    "2026-09-22T00:00:00.000Z",
  );

  assert.equal(document.card.name, "Stellacorn Herder");
  assert.equal(document.runtimeSupportStatus, "supported");
  assert.deepEqual(document.behaviorModel.clauses[0]?.triggers, [{
    behaviorId: "trigger.on_move",
    parameters: { subject: "source" },
    confidence: "high",
    order: 0,
  }]);
  assert.deepEqual(document.behaviorModel.clauses[0]?.effects, [{
    behaviorId: "action.draw_cards",
    parameters: { player: "controller", count: 1 },
    confidence: "high",
    order: 1,
  }]);
});

test("Stellacorn Herder publication is confirmation-gated and source-bound", async () => {
  const [packageSource, publisherSource] = await Promise.all([
    readFile("package.json", "utf8"),
    readFile("scripts/publish-stellacorn-herder-canonical-card.ts", "utf8"),
  ]);

  assert.match(packageSource, /catalog:publish-stellacorn-herder/);
  assert.match(publisherSource, /--confirm/);
  assert.match(publisherSource, /SFD-048\/221/);
  assert.match(publisherSource, /syncBehaviorDefinitions/);
  assert.match(publisherSource, /buildOrnnCanonicalPublication/);
  assert.match(publisherSource, /publishCanonicalCard/);
});
