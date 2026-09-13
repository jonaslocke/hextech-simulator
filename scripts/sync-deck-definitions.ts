import { readFile } from "node:fs/promises";
import { getMongoClient, getMongoDatabaseName } from "../src/server/db";
import { PERMANENT_DECK_DEFINITIONS } from "../src/server/game/deck-definition";
import { syncDeckDefinitions } from "../src/server/services/deck-catalog-service";

if (!process.argv.includes("--confirm")) {
  throw new Error("Refusing to synchronize deck definitions without --confirm.");
}

const seeds = await Promise.all(PERMANENT_DECK_DEFINITIONS.map(loadSeed));
const client = await getMongoClient();

try {
  const result = await syncDeckDefinitions(
    client.db(getMongoDatabaseName()),
    seeds,
  );
  console.log(
    `Synchronized deck definitions: ${result.insertedCount} inserted, ` +
      `${result.updatedCount} updated, ${result.unchangedCount} unchanged.`,
  );
} finally {
  await client.close();
}

async function loadSeed(seed: (typeof PERMANENT_DECK_DEFINITIONS)[number]) {
  return {
    id: seed.id,
    label: seed.label,
    sourceText: await readFile(seed.sourcePath, "utf8"),
  };
}
