import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { cardSetFileSchema, type Card, type CardCatalog } from "../src/server/catalog";
import { validateDeckList } from "../src/server/deck";

test("validates the normalized Garen ingestion deck against local set data", async () => {
  const catalog = await loadLocalSetCatalog();
  const result = validateDeckList(
    await readFile(path.join(process.cwd(), "data", "decks", "garen.dec.txt"), "utf8"),
    catalog,
    { ownerId: "garen" },
  );

  assert.equal(result.ok, true, JSON.stringify(result.issues, null, 2));
  if (!result.ok) return;

  assert.equal(result.snapshot.legend.name, "Might of Demacia - Starter");
  assert.equal(result.snapshot.champion.name, "Garen, Rugged");
  assert.equal(result.snapshot.instances.length, 56);
});

async function loadLocalSetCatalog(): Promise<CardCatalog> {
  const setDirectory = path.join(process.cwd(), "data", "sets");
  const setFiles = (await readdir(setDirectory))
    .filter((filename) => filename.endsWith(".json"))
    .sort();
  const cards = (
    await Promise.all(
      setFiles.map(async (filename) =>
        cardSetFileSchema.parse(
          JSON.parse(await readFile(path.join(setDirectory, filename), "utf8")),
        ),
      ),
    )
  ).flat();
  const byName = new Map<string, Card>();
  const byPublicCode = new Map<string, Card>();
  const hash = createHash("sha256");

  hash.update(JSON.stringify(cards));
  for (const card of cards) {
    const current = byName.get(card.name);
    if (!current || (current.metadata.alternate_art && !card.metadata.alternate_art)) {
      byName.set(card.name, card);
    }
    byPublicCode.set(card.public_code, card);
  }

  return {
    cards,
    byName,
    byPublicCode,
    setFiles,
    versionHash: hash.digest("hex"),
  };
}
