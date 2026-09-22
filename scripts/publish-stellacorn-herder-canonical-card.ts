import { getMongoClient, getMongoDatabaseName } from "../src/server/db";
import {
  buildCurrentBehaviorCatalog,
  publishCanonicalCard,
  syncBehaviorDefinitions,
} from "../src/server/card-catalog";
import { buildOrnnCanonicalPublication } from "../src/server/card-catalog/ornn-canonical-publications";
import { loadSourceCardCatalog } from "../src/server/catalog";

const CONFIRM_FLAG = "--confirm";
const TARGET_PUBLIC_CODE = "SFD-048/221";

if (!process.argv.includes(CONFIRM_FLAG)) {
  throw new Error(
    `Refusing to publish Stellacorn Herder without ${CONFIRM_FLAG}.`,
  );
}

const [catalog, behaviorCatalog] = await Promise.all([
  loadSourceCardCatalog(),
  buildCurrentBehaviorCatalog(),
]);
const card = catalog.byPublicCode.get(TARGET_PUBLIC_CODE);
if (!card) throw new Error(`Missing local card source: ${TARGET_PUBLIC_CODE}.`);

const client = await getMongoClient();
try {
  const db = client.db(getMongoDatabaseName());
  const now = new Date().toISOString();
  await syncBehaviorDefinitions(db, behaviorCatalog, now);
  const document = await publishCanonicalCard(
    db,
    buildOrnnCanonicalPublication(card),
    now,
    behaviorCatalog,
  );
  console.log(`Published ${document.cardCode} ${document.card.name}`);
} finally {
  await client.close();
}
