import { readFile } from "node:fs/promises";
import { getMongoClient, getMongoDatabaseName } from "../src/server/db";
import {
  buildCurrentBehaviorCatalog,
  buildCanonicalCardDocument,
  publishCanonicalCard,
  syncBehaviorDefinitions,
} from "../src/server/card-catalog";
import {
  buildJayceCanonicalPublication,
  hasJayceCanonicalPublication,
} from "../src/server/card-catalog/jayce-canonical-publications";
import { loadCardCatalog } from "../src/server/catalog";
import { parseDeckList, resolveDeckCard } from "../src/server/deck";
import { buildValidatedDeckSnapshotFromSource } from "../src/server/services/deck-catalog-service";

const CONFIRM_FLAG = "--confirm";
const sourcePath = "data/decks/jayce.dec.txt";

if (!process.argv.includes(CONFIRM_FLAG)) {
  throw new Error(
    `Refusing to publish Jayce canonical cards without ${CONFIRM_FLAG}.`,
  );
}

const [catalog, source, behaviorCatalog] = await Promise.all([
  loadCardCatalog(),
  readFile(sourcePath, "utf8"),
  buildCurrentBehaviorCatalog(),
]);
const parsedDeck = parseDeckList(source);
const cardsByCode = new Map(
  parsedDeck.entries.flatMap((entry) => {
    const card = resolveDeckCard(catalog, entry);
    if (!card) throw new Error(`Missing local source card: ${entry.name}`);
    const cardCode = card.public_code.split("/")[0]!;
    return hasJayceCanonicalPublication(cardCode)
      ? [[cardCode, card] as const]
      : [];
  }),
);
const publications = [...cardsByCode.values()].map(
  (card) => buildJayceCanonicalPublication(card),
);
for (const publication of publications) {
  buildCanonicalCardDocument(
    publication,
    behaviorCatalog,
    "preflight-created",
    "preflight-updated",
  );
}
const client = await getMongoClient();

try {
  const db = client.db(getMongoDatabaseName());
  const now = new Date().toISOString();

  await syncBehaviorDefinitions(db, behaviorCatalog, now);
  for (const publication of publications) {
    const document = await publishCanonicalCard(
      db,
      publication,
      now,
      behaviorCatalog,
    );
    console.log(`Published ${document.cardCode} ${document.card.name}`);
  }

  const snapshot = await buildValidatedDeckSnapshotFromSource(db, source);
  console.log(
    `Verified Jayce catalog snapshot: ${snapshot.cards.length} unique cards, ` +
      `${snapshot.entries.length} deck entries.`,
  );
} finally {
  await client.close();
}
