import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildBehaviorDefinitionDocument,
  buildPrimitiveCatalog,
  findBehaviorCatalogSyncIssues
} from "../src/server/card-catalog";

test("builds stable reusable behavior definitions without card examples", () => {
  const dealDamage = buildPrimitiveCatalog().find(
    (entry) => entry.id === "action.deal_damage"
  )!;
  const first = buildBehaviorDefinitionDocument(
    dealDamage,
    "2026-06-22T00:00:00.000Z"
  );
  const second = buildBehaviorDefinitionDocument(
    { ...dealDamage, examples: [{
      cardCode: "TST-001",
      cardName: "Example",
      publicCode: "TST-001/001",
      sourceText: "Deal 1 to a unit."
    }] },
    "2026-06-23T00:00:00.000Z"
  );

  assert.equal(first.id, "action.deal_damage");
  assert.equal(first.definitionHash, second.definitionHash);
  assert.equal("examples" in first, false);
  assert.deepEqual(
    first.parameters.find((parameter) => parameter.name === "target")?.options,
    ["unit", "friendly_unit", "enemy_unit"]
  );
});

test("reports missing and outdated behavior definitions", () => {
  const entries = buildPrimitiveCatalog().slice(0, 2);
  const first = buildBehaviorDefinitionDocument(entries[0]!);

  assert.deepEqual(
    findBehaviorCatalogSyncIssues(
      [{ id: first.id, definitionHash: "outdated" }],
      entries
    ),
    [
      `Outdated behavior definition: ${entries[0]!.id}`,
      `Missing behavior definition: ${entries[1]!.id}`
    ]
  );
});
