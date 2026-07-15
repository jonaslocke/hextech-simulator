import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import {
  cardSetFileSchema,
  getDeckCardLookupCandidates,
  getDeckCardNameAliases,
  type Card,
  type CardCatalog,
} from "../src/server/catalog";
import { validateDeckList } from "../src/server/deck";

test("keeps real Legend deck names while resolving their source JSON records", async () => {
  const catalog = await loadLocalSetCatalog();
  const kaisaLegend = catalog.byName.get("Daughter of the Void");
  const kaisaChampion = catalog.byName.get("Kai'Sa, Survivor");
  const dariusLegend = catalog.byName.get("Hand of Noxus");

  assert.ok(kaisaLegend);
  assert.ok(kaisaChampion);
  assert.ok(dariusLegend);
  assert.deepEqual(getDeckCardNameAliases(kaisaLegend), [
    "Daughter of the Void",
    "Kai'Sa - Daughter of the Void",
    "Kai'Sa, Daughter of the Void",
  ]);
  assert.deepEqual(getDeckCardNameAliases(dariusLegend), [
    "Hand of Noxus",
    "Darius - Hand of Noxus",
    "Darius, Hand of Noxus",
  ]);
  assert.deepEqual(
    getDeckCardLookupCandidates("Darius, Hand of Noxus"),
    ["Darius, Hand of Noxus", "Hand of Noxus"],
  );
  assert.deepEqual(getDeckCardNameAliases(kaisaChampion), ["Kai'Sa, Survivor"]);

  for (const fileName of ["kaisa.dec.txt", "viktor.dec.txt"]) {
    const sourceText = await readFile(
      path.join(process.cwd(), "docs", "full-ingestion-decks", "OGN", fileName),
      "utf8",
    );
    const result = validateDeckList(sourceText, catalog);

    assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
  }
});

async function loadLocalSetCatalog(): Promise<CardCatalog> {
  const setDirectory = path.join(process.cwd(), "data", "sets");
  const setFiles = (await readdir(setDirectory))
    .filter((fileName) => fileName.endsWith(".json"))
    .sort();
  const cards = (
    await Promise.all(
      setFiles.map(async (fileName) =>
        cardSetFileSchema.parse(
          JSON.parse(await readFile(path.join(setDirectory, fileName), "utf8")),
        ),
      ),
    )
  ).flat();
  const byName = new Map<string, Card>();
  const byPublicCode = new Map<string, Card>();

  for (const card of cards) {
    const existing = byName.get(card.name);
    if (!existing || (existing.metadata.alternate_art && !card.metadata.alternate_art)) {
      byName.set(card.name, card);
    }
    byPublicCode.set(card.public_code, card);
  }

  return {
    cards,
    byName,
    byPublicCode,
    setFiles,
    versionHash: createHash("sha256").update(JSON.stringify(cards)).digest("hex"),
  };
}
