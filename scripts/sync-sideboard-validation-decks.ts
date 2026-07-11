import { readFile } from "node:fs/promises";
import path from "node:path";
import { type Db } from "mongodb";
import {
  CANONICAL_CARDS_COLLECTION,
  hashCardRulesText,
  type CanonicalCardDocument,
} from "../src/server/card-catalog";
import { cardSetFileSchema, type Card } from "../src/server/catalog";
import { getMongoClient, getMongoDatabaseName } from "../src/server/db";
import {
  hashDeckSourceText,
  validateDeckDefinitionDocument,
  type DeckDefinitionDocument,
  type DeckId,
} from "../src/server/game/deck-definition";
import { buildDeckSnapshotFromSource } from "../src/server/game/catalog";
import { createDeckDefinitionRepository } from "../src/server/repositories/deck-definition-repository";

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

const MASTER_YI_CARD_CODES = ["OGS-004", "OGS-009"] as const;

if (!process.argv.includes(CONFIRM_FLAG)) {
  throw new Error(
    `Refusing to synchronize sideboard validation decks without ${CONFIRM_FLAG}.`,
  );
}

const client = await getMongoClient();

try {
  const db = client.db(getMongoDatabaseName());
  const now = new Date().toISOString();

  await repairMasterYiCanonicalNames(db, now);

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
    await buildDeckSnapshotFromSource(db, sourceText);

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

async function repairMasterYiCanonicalNames(db: Db, now: string) {
  const localCards = await loadLocalOgsCardsByCode();
  const collection = db.collection<
    CanonicalCardDocument & { _id: string }
  >(CANONICAL_CARDS_COLLECTION);

  for (const cardCode of MASTER_YI_CARD_CODES) {
    const localCard = localCards.get(cardCode);
    if (!localCard) {
      throw new Error(`Local OGS card is unavailable: ${cardCode}.`);
    }

    const existing = await collection.findOne({ _id: cardCode });
    if (!existing) {
      throw new Error(`Persisted canonical card is unavailable: ${cardCode}.`);
    }

    if (existing.card.name === localCard.name) {
      continue;
    }

    await collection.updateOne(
      { _id: cardCode },
      {
        $set: {
          card: localCard,
          sourceTextHash: hashCardRulesText(localCard),
          updatedAt: now,
        },
      },
    );

    console.log(
      `Updated canonical card ${cardCode}: ${existing.card.name} -> ${localCard.name}`,
    );
  }
}

async function loadLocalOgsCardsByCode(): Promise<Map<string, Card>> {
  const source = await readFile(
    path.join(process.cwd(), "data", "sets", "ogs.json"),
    "utf8",
  );
  const cards = cardSetFileSchema.parse(JSON.parse(source));
  return new Map(
    cards.flatMap((card) => {
      const code = card.public_code.split("/")[0];
      return code ? [[code, card] as const] : [];
    }),
  );
}
