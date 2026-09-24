import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import {
  createCardCatalogVersionDocument,
  cardSetFileSchema,
  loadCardCatalog,
  persistCardCatalogVersion,
  requireCardByName
} from "../src/server/catalog";

test("loads every card from the local Riftbound set corpus", async () => {
  const catalog = await loadCardCatalog();
  const setFiles = (await readdir(path.join(process.cwd(), "data", "sets")))
    .filter((name) => name.endsWith(".json"))
    .sort();
  const sourceCodes = new Set<string>();

  assert.deepEqual(catalog.setFiles, setFiles);
  for (const setFile of setFiles) {
    const sourceCards = cardSetFileSchema.parse(
      JSON.parse(await readFile(path.join("data", "sets", setFile), "utf8")),
    );
    for (const card of sourceCards) {
      sourceCodes.add(card.public_code);
    }
  }
  assert.deepEqual(new Set(catalog.byPublicCode.keys()), sourceCodes);
  assert.equal(catalog.cards.length, sourceCodes.size);
  assert.equal(requireCardByName(catalog, "Dark Child - Starter").classification.type, "Legend");
  assert.equal(requireCardByName(catalog, "Lady of Luminosity - Starter").classification.type, "Legend");
  assert.equal(requireCardByName(catalog, "Annie, Stubborn").classification.supertype, "Champion");
  assert.equal(requireCardByName(catalog, "Lux, Crownguard").classification.supertype, "Champion");
  assert.match(catalog.versionHash, /^[a-f0-9]{64}$/);
});

test("creates and persists catalog version metadata", async () => {
  const catalog = await loadCardCatalog();
  const now = new Date("2026-06-11T00:00:00.000Z");
  const document = createCardCatalogVersionDocument(catalog, now);
  let persisted = null as typeof document | null;

  assert.equal(document.id, catalog.versionHash);
  assert.equal(document.versionHash, catalog.versionHash);
  assert.equal(document.cardCount, catalog.cards.length);
  assert.deepEqual(document.setFiles, catalog.setFiles);
  assert.equal(document.createdAt, now.toISOString());

  const result = await persistCardCatalogVersion(
    {
      async findById() {
        return null;
      },
      async insert() {
        throw new Error("persistCardCatalogVersion should upsert.");
      },
      async upsert(nextDocument) {
        persisted = nextDocument;
      }
    },
    catalog,
    now
  );

  assert.deepEqual(result, document);
  assert.deepEqual(persisted, document);
});
