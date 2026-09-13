import { readFile } from "node:fs/promises";
import { getMongoClient, getMongoDatabaseName } from "../src/server/db";
import {
  buildCurrentBehaviorCatalog,
  publishCanonicalCard,
  syncBehaviorDefinitions,
} from "../src/server/card-catalog";
import { buildOrnnCanonicalPublication } from "../src/server/card-catalog/ornn-canonical-publications";
import { loadCardCatalog } from "../src/server/catalog";
import { parseDeckList, resolveDeckCard } from "../src/server/deck";
import { buildDeckSnapshotFromSource } from "../src/server/game/catalog";

const CONFIRM_FLAG = "--confirm";
const sourcePath =
  "data/decks/Ornn, Fire Below the Mountain , a deck by MICE TheMаnLаnd.txt";

if (!process.argv.includes(CONFIRM_FLAG)) {
  throw new Error(
    `Refusing to publish Ornn canonical cards without ${CONFIRM_FLAG}.`,
  );
}

const [catalog, source, behaviorCatalog] = await Promise.all([
  loadCardCatalog(),
  readFile(sourcePath, "utf8"),
  buildCurrentBehaviorCatalog(),
]);
const parsedDeck = parseDeckList(source);
const cardsByCode = new Map(
  parsedDeck.entries.map((entry) => {
    const card = resolveDeckCard(catalog, entry.name);
    if (!card) throw new Error(`Missing local source card: ${entry.name}`);
    return [card.public_code.split("/")[0]!, card] as const;
  }),
);
const client = await getMongoClient();

try {
  const db = client.db(getMongoDatabaseName());
  const now = new Date().toISOString();

  await syncBehaviorDefinitions(db, behaviorCatalog, now);
  for (const card of cardsByCode.values()) {
    const document = await publishCanonicalCard(
      db,
      buildOrnnCanonicalPublication(card),
      now,
      behaviorCatalog,
    );
    console.log(`Published ${document.cardCode} ${document.card.name}`);
  }

  const snapshot = await buildDeckSnapshotFromSource(db, source);
  console.log(
    `Verified Ornn catalog snapshot: ${snapshot.cards.length} unique cards, ` +
      `${snapshot.entries.length} deck entries.`,
  );
} finally {
  await client.close();
}
