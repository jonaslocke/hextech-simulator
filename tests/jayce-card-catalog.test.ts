import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCanonicalCardDocument,
  buildCurrentBehaviorCatalog,
} from "../src/server/card-catalog";
import { buildJayceCanonicalPublication } from "../src/server/card-catalog/jayce-canonical-publications";
import { loadCardCatalog } from "../src/server/catalog";

test("Jayce deck reusable publications compile their current supported cards", async () => {
  const [catalog, behaviors] = await Promise.all([
    loadCardCatalog(),
    buildCurrentBehaviorCatalog(),
  ]);

  for (const code of ["VEN-149/166", "VEN-068/166", "OGN-099/298", "OGN-138/298", "OGN-133/298", "OGN-156/298", "UNL-069/219", "UNL-088/219", "UNL-103/219", "UNL-106/219", "VEN-049/166", "VEN-075/166", "VEN-085/166", "OGN-287/298", "VEN-066/166"]) {
    const card = catalog.byPublicCode.get(code);
    assert.ok(card, `Missing source card ${code}`);
    const publication = buildJayceCanonicalPublication(card);
    if (code === "UNL-103/219") {
      const assignments = publication.clauses.flatMap((clause) => clause.assignments);
      assert.equal(
        assignments.find((assignment) => assignment.primitiveId === "action.optional")?.parameters.commitAtPlay,
        true,
      );
      assert.ok(assignments.some((assignment) =>
        assignment.primitiveId === "selector.card" &&
        assignment.parameters.selectionKey === "recycledCards" &&
        assignment.parameters.onlyIfSelectionKey === "mode",
      ));
    }
    const document = buildCanonicalCardDocument(
      publication,
      behaviors,
      "created",
      "updated",
    );
    assert.equal(document.runtimeSupportStatus, "supported");
  }
});
