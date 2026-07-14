import { readFile } from "node:fs/promises";
import type { Db } from "mongodb";
import { getMongoClient, getMongoDatabaseName } from "../src/server/db";
import {
  hashDeckSourceText,
  validateDeckDefinitionDocument,
  type DeckDefinitionDocument,
} from "../src/server/game/deck-definition";
import { buildDeckSnapshotFromSource } from "../src/server/game/catalog";
import { createDeckDefinitionRepository } from "../src/server/repositories/deck-definition-repository";

const CONFIRM_FLAG = "--confirm";
const DECK_ID = "annie-stacked-deck" as const;
const DECK_LABEL = "Annie - Stacked Deck";
const DECK_FILE_PATH = "data/decks/annie-stacked-deck.dec.txt";

if (!process.argv.includes(CONFIRM_FLAG)) {
  throw new Error(
    `Refusing to synchronize ${DECK_ID} without ${CONFIRM_FLAG}.`,
  );
}

const sourceText = await readFile(DECK_FILE_PATH, "utf8");
const client = await getMongoClient();

try {
  const db = client.db(getMongoDatabaseName());
  const result = await syncAnnieStackedDeck(db, sourceText);
  console.log(
    `Synchronized ${DECK_ID}: ${result === "inserted" ? "inserted" : result}.`,
  );
} finally {
  await client.close();
}

async function syncAnnieStackedDeck(
  db: Db,
  sourceText: string,
): Promise<"inserted" | "updated" | "unchanged"> {
  await buildDeckSnapshotFromSource(db, sourceText);

  const repository = createDeckDefinitionRepository(db);
  const existing = await repository.findById(DECK_ID);
  const sourceTextHash = hashDeckSourceText(sourceText);

  if (
    existing &&
    existing.label === DECK_LABEL &&
    existing.sourceTextHash === sourceTextHash
  ) {
    return "unchanged";
  }

  const now = new Date().toISOString();
  const document = validateDeckDefinitionDocument({
    id: DECK_ID,
    label: DECK_LABEL,
    sourceText,
    sourceTextHash,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  } satisfies DeckDefinitionDocument);

  await repository.upsert(document);
  return existing ? "updated" : "inserted";
}
