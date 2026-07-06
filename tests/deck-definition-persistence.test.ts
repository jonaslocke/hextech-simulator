import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import type { Db } from "mongodb";
import {
  hashDeckSourceText,
  validateDeckDefinitionDocument,
  type DeckDefinitionDocument,
  type DeckDefinitionSeed,
} from "../src/server/game";
import type { DeckDefinitionRepository } from "../src/server/repositories/deck-definition-repository";
import {
  DeckCatalogUnavailableError,
  getPlayableDeckOptions,
  planDeckDefinitionSync,
} from "../src/server/services/deck-catalog-service";

const NOW = "2026-07-06T12:00:00.000Z";
const LATER = "2026-07-07T12:00:00.000Z";

test("validates persisted deck identity, source syntax, and source hash", () => {
  const sourceText = validSourceText("Lux");
  const valid = definition("lux", "Lux", sourceText);

  assert.deepEqual(validateDeckDefinitionDocument(valid), valid);
  assert.throws(
    () => validateDeckDefinitionDocument({ ...valid, id: "future-deck" }),
  );
  assert.throws(
    () =>
      validateDeckDefinitionDocument({
        ...valid,
        sourceText: "not a deck",
        sourceTextHash: hashDeckSourceText("not a deck"),
      }),
    /Deck entry before section/,
  );
  assert.throws(
    () =>
      validateDeckDefinitionDocument({
        ...valid,
        sourceTextHash: "0".repeat(64),
      }),
    /source hash mismatch/,
  );
});

test("plans idempotent deck-definition synchronization", async () => {
  const repository = memoryRepository();
  const seeds = seedSet();

  const first = await planDeckDefinitionSync(repository, seeds, NOW);
  assert.deepEqual(first.result, {
    insertedCount: 2,
    updatedCount: 0,
    unchangedCount: 0,
  });
  await Promise.all(first.writes.map((item) => repository.upsert(item)));

  const second = await planDeckDefinitionSync(repository, seeds, LATER);
  assert.deepEqual(second.result, {
    insertedCount: 0,
    updatedCount: 0,
    unchangedCount: 2,
  });
  assert.deepEqual(second.writes, []);

  const changedSeeds = seedSet();
  changedSeeds[0] = { ...changedSeeds[0]!, label: "Lux Deck" };
  const changed = await planDeckDefinitionSync(
    repository,
    changedSeeds,
    LATER,
  );
  assert.deepEqual(changed.result, {
    insertedCount: 0,
    updatedCount: 1,
    unchangedCount: 1,
  });
  assert.equal(changed.writes[0]?.createdAt, NOW);
  assert.equal(changed.writes[0]?.updatedAt, LATER);
});

test("requires the complete fixed seed set", async () => {
  await assert.rejects(
    () =>
      planDeckDefinitionSync(
        memoryRepository(),
        [seedSet()[0]!],
        NOW,
      ),
    /exactly: lux, annie/,
  );
});

test("returns valid playable options and rejects a fully unavailable catalog", async () => {
  const repository = memoryRepository(seedSet().map(seedToDefinition));
  const errors: unknown[] = [];
  const logger = { error: (...values: unknown[]) => errors.push(values) };

  const partial = await getPlayableDeckOptions(
    {} as Db,
    async (_db, id) => {
      if (id === "annie") throw new Error("unavailable");
      return {
        sourceText: "",
        catalogDigest: id,
        entries: [],
        cards: [],
      };
    },
    logger,
    repository,
  );
  assert.deepEqual(partial, [{ id: "lux", label: "Lux" }]);
  assert.equal(errors.length, 1);

  await assert.rejects(
    () =>
      getPlayableDeckOptions(
        {} as Db,
        async () => {
          throw new Error("unavailable");
        },
        logger,
        repository,
      ),
    DeckCatalogUnavailableError,
  );
});

test("runtime deck loading has no filesystem deck dependency", async () => {
  const catalogSource = await readFile(
    "src/server/game/catalog.ts",
    "utf8",
  );
  const serviceSource = await readFile(
    "src/server/services/deck-catalog-service.ts",
    "utf8",
  );
  const runtimeSource = `${catalogSource}\n${serviceSource}`;

  assert.doesNotMatch(runtimeSource, /node:fs/);
  assert.doesNotMatch(runtimeSource, /process\.cwd/);
  assert.doesNotMatch(runtimeSource, /data\/decks/);
});

test("deck synchronization is confirmation-gated and reset-safe", async () => {
  const syncSource = await readFile(
    "scripts/sync-deck-definitions.ts",
    "utf8",
  );
  const resetSource = await readFile("scripts/reset-game-runtime.ts", "utf8");

  assert.match(syncSource, /--confirm/);
  assert.match(syncSource, /data\/decks\/lux\.dec\.txt/);
  assert.match(syncSource, /data\/decks\/annie\.dec\.txt/);
  assert.doesNotMatch(resetSource, /deckDefinitions/);
});

function seedSet(): DeckDefinitionSeed[] {
  return [
    { id: "lux", label: "Lux", sourceText: validSourceText("Lux") },
    { id: "annie", label: "Annie", sourceText: validSourceText("Annie") },
  ];
}

function validSourceText(name: string): string {
  return `Legend:\n1 ${name}\n`;
}

function seedToDefinition(seed: DeckDefinitionSeed): DeckDefinitionDocument {
  return definition(seed.id, seed.label, seed.sourceText);
}

function definition(
  id: "lux" | "annie",
  label: string,
  sourceText: string,
): DeckDefinitionDocument {
  return {
    id,
    label,
    sourceText,
    sourceTextHash: hashDeckSourceText(sourceText),
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function memoryRepository(
  initial: DeckDefinitionDocument[] = [],
): DeckDefinitionRepository {
  const documents = new Map(initial.map((item) => [item.id, item]));

  return {
    async findById(id) {
      return documents.get(id) ?? null;
    },
    async upsert(document) {
      documents.set(document.id, document);
    },
  };
}
