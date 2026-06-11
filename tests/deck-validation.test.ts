import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { loadCardCatalog } from "../src/server/catalog";
import {
  createDeckSnapshotDocument,
  persistDeckSnapshot,
  validateDeckList
} from "../src/server/deck";

async function loadDeck(filename: string) {
  return readFile(path.join(process.cwd(), "data", "decks", filename), "utf8");
}

test("validates Annie and Lux starter fixture decks", async () => {
  const catalog = await loadCardCatalog();
  const annie = validateDeckList(await loadDeck("annie.dec.txt"), catalog, {
    ownerId: "annie"
  });
  const lux = validateDeckList(await loadDeck("lux.dec.txt"), catalog, {
    ownerId: "lux"
  });

  assert.equal(annie.ok, true, JSON.stringify(annie.issues, null, 2));
  assert.equal(lux.ok, true, JSON.stringify(lux.issues, null, 2));

  if (annie.ok) {
    assert.equal(annie.snapshot.legend.name, "Dark Child - Starter");
    assert.equal(annie.snapshot.champion.name, "Annie, Stubborn");
    assert.equal(annie.snapshot.instances.length, 56);
  }

  if (lux.ok) {
    assert.equal(lux.snapshot.legend.name, "Lady of Luminosity - Starter");
    assert.equal(lux.snapshot.champion.name, "Lux, Crownguard");
    assert.equal(lux.snapshot.instances.length, 56);
  }
});

test("rejects non-official Main Deck section spelling", async () => {
  const catalog = await loadCardCatalog();
  const source = (await loadDeck("annie.dec.txt")).replace("MainDeck:", "Main Deck:");
  const result = validateDeckList(source, catalog);

  assert.equal(result.ok, false);
  assert.equal(result.issues[0]?.code, "deck.parse");
});

test("rejects unknown cards", async () => {
  const catalog = await loadCardCatalog();
  const source = (await loadDeck("annie.dec.txt")).replace("3 Gust", "3 Missing Card");
  const result = validateDeckList(source, catalog);

  assert.equal(result.ok, false);
  assert.equal(result.issues.some((issue) => issue.code === "deck.unknownCard"), true);
});

test("rejects champion that does not match the legend tag", async () => {
  const catalog = await loadCardCatalog();
  const source = (await loadDeck("annie.dec.txt")).replace("1 Annie, Stubborn", "1 Lux, Crownguard");
  const result = validateDeckList(source, catalog);

  assert.equal(result.ok, false);
  assert.equal(result.issues.some((issue) => issue.code === "deck.championTag"), true);
});

test("creates and persists deck snapshot documents", async () => {
  const catalog = await loadCardCatalog();
  const validation = validateDeckList(await loadDeck("annie.dec.txt"), catalog, {
    ownerId: "annie"
  });
  const now = new Date("2026-06-11T00:00:00.000Z");

  assert.equal(validation.ok, true, JSON.stringify(validation.issues, null, 2));

  if (!validation.ok) {
    return;
  }

  const document = createDeckSnapshotDocument({
    snapshot: validation.snapshot,
    playerId: "annie",
    matchId: "match-1",
    now
  });
  let persisted = null as typeof document | null;

  assert.match(document.id, /^deck:annie:[a-f0-9]{64}$/);
  assert.equal(document.playerId, "annie");
  assert.equal(document.matchId, "match-1");
  assert.equal(document.catalogVersionHash, catalog.versionHash);
  assert.equal(document.snapshot.instances.length, 56);
  assert.equal(document.createdAt, now.toISOString());

  const result = await persistDeckSnapshot(
    {
      async findById() {
        return null;
      },
      async insert() {
        throw new Error("persistDeckSnapshot should upsert.");
      },
      async upsert(nextDocument) {
        persisted = nextDocument;
      }
    },
    {
      snapshot: validation.snapshot,
      playerId: "annie",
      matchId: "match-1",
      now
    }
  );

  assert.deepEqual(result, document);
  assert.deepEqual(persisted, document);
});
