import assert from "node:assert/strict";
import { test } from "node:test";
import { loadCardCatalog, requireCardByName } from "../src/server/catalog";

test("loads local Riftbound card catalog", async () => {
  const catalog = await loadCardCatalog();

  assert.equal(catalog.cards.length, 656);
  assert.equal(requireCardByName(catalog, "Dark Child - Starter").classification.type, "Legend");
  assert.equal(requireCardByName(catalog, "Lady of Luminosity - Starter").classification.type, "Legend");
  assert.equal(requireCardByName(catalog, "Annie, Stubborn").classification.supertype, "Champion");
  assert.equal(requireCardByName(catalog, "Lux, Crownguard").classification.supertype, "Champion");
  assert.match(catalog.versionHash, /^[a-f0-9]{64}$/);
});
