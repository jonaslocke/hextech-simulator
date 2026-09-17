import { readFile } from "node:fs/promises";
import { type Db } from "mongodb";
import { getMongoClient, getMongoDatabaseName } from "../src/server/db";
import {
  hashDeckSourceText,
  validateDeckDefinitionDocument,
  type DeckDefinitionDocument,
  type DeckId,
} from "../src/server/game/deck-definition";
import { createDeckDefinitionRepository } from "../src/server/repositories/deck-definition-repository";
import { buildValidatedDeckSnapshotFromSource } from "../src/server/services/deck-catalog-service";

const CONFIRM_FLAG = "--confirm";

const SIDEBOARD_SEEDS = [
  {
    id: "lux-s",
    label: "Lux (S)",
    filePath: "data/decks/sideboard-validation/lux.dec.txt",
  },
  {
    id: "annie-s",
    label: "Annie (S)",
    filePath: "data/decks/sideboard-validation/annie.dec.txt",
  },
  {
    id: "master-yi-s",
    label: "Master Yi (S)",
    filePath: "data/decks/sideboard-validation/master-yi.dec.txt",
  },
  {
    id: "garen-s",
    label: "Garen (S)",
    filePath: "data/decks/sideboard-validation/garen.dec.txt",
  },
] as const satisfies Array<{
  id: DeckId;
  label: string;
  filePath: string;
}>;

if (!process.argv.includes(CONFIRM_FLAG)) {
  throw new Error(
    `Refusing to synchronize sideboard validation decks without ${CONFIRM_FLAG}.`,
  );
}

const client = await getMongoClient();

try {
  const db = client.db(getMongoDatabaseName());
  const now = new Date().toISOString();

  const result = await syncSideboardValidationDecks(db, now);
  console.log(
    `Synchronized sideboard validation deck definitions: ` +
      `${result.insertedCount} inserted, ${result.updatedCount} updated, ` +
      `${result.unchangedCount} unchanged.`,
  );
} finally {
  await client.close();
}

async function syncSideboardValidationDecks(db: Db, now: string) {
  const repository = createDeckDefinitionRepository(db);
  const result = {
    insertedCount: 0,
    updatedCount: 0,
    unchangedCount: 0,
  };

  for (const seed of SIDEBOARD_SEEDS) {
    const sourceText = await readFile(seed.filePath, "utf8");

    // Persistence is downstream of the same complete Deck Validation authority
    // used for normal playable decks. Do not repair publication data here.
    await buildValidatedDeckSnapshotFromSource(db, sourceText);

    const existing = await repository.findById(seed.id);
    const sourceTextHash = hashDeckSourceText(sourceText);
    if (
      existing &&
      existing.label === seed.label &&
      existing.sourceTextHash === sourceTextHash
    ) {
      result.unchangedCount += 1;
      continue;
    }

    const document = validateDeckDefinitionDocument({
      id: seed.id,
      label: seed.label,
      sourceText,
      sourceTextHash,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    } satisfies DeckDefinitionDocument);

    await repository.upsert(document);
    if (existing) result.updatedCount += 1;
    else result.insertedCount += 1;
  }

  return result;
}
