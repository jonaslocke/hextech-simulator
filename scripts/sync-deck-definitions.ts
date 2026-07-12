import { readFile } from "node:fs/promises";
import { getMongoClient, getMongoDatabaseName } from "../src/server/db";
import { syncDeckDefinitions } from "../src/server/services/deck-catalog-service";

if (!process.argv.includes("--confirm")) {
  throw new Error("Refusing to synchronize deck definitions without --confirm.");
}

const seeds = await Promise.all([
  loadSeed("lux", "Lux", "data/decks/lux.dec.txt"),
  loadSeed("annie", "Annie", "data/decks/annie.dec.txt"),
  loadSeed("master-yi", "Master Yi", "data/decks/masteryi.dec.txt"),
  loadSeed("garen", "Garen", "data/decks/garen.dec.txt"),
  loadSeed("kaisa", "Kai'Sa", "data/decks/kaisa.dec.txt"),
]);
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

async function loadSeed(
  id: "lux" | "annie" | "master-yi" | "garen" | "kaisa",
  label: string,
  filePath: string,
) {
  return {
    id,
    label,
    sourceText: await readFile(filePath, "utf8"),
  };
}
