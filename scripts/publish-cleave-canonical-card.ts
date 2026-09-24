import { getMongoClient, getMongoDatabaseName } from "../src/server/db";
import {
  buildCanonicalCardDocument,
  buildCurrentBehaviorCatalog,
  publishCanonicalCard,
} from "../src/server/card-catalog";
import { buildCleaveCanonicalPublication } from "../src/server/card-catalog/cleave-canonical-publication";
import { loadSourceCardCatalog } from "../src/server/catalog";
import { inspectCanonicalDeckReadiness } from "../src/server/game/catalog-readiness";

if (!process.argv.includes("--confirm")) {
  throw new Error("Refusing to publish Cleave without --confirm.");
}

const catalog = await loadSourceCardCatalog();
const card = catalog.byPublicCode.get("OGN-004/298");
if (!card) throw new Error("Missing local source card: OGN-004/298.");

const behaviorCatalog = await buildCurrentBehaviorCatalog();
const publication = buildCleaveCanonicalPublication(card);
const now = new Date().toISOString();
const preview = buildCanonicalCardDocument(
  publication,
  behaviorCatalog,
  now,
  now,
);
const readiness = inspectCanonicalDeckReadiness({
  cards: [preview],
  behaviorDefinitions: behaviorCatalog,
});
if (readiness.reasons.length > 0) {
  throw new Error(
    `Cleave canonical model is not executable: ${readiness.reasons.map((reason) => reason.message).join("; ")}`,
  );
}

const client = await getMongoClient();
try {
  const db = client.db(getMongoDatabaseName());
  await publishCanonicalCard(
    db,
    publication,
    now,
    behaviorCatalog,
  );
  console.log(`Published executable ${preview.cardCode} ${preview.card.name}.`);
} finally {
  await client.close();
}
