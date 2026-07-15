import { readdir } from "node:fs/promises";
import path from "node:path";
import { getMongoClient, getMongoDatabaseName } from "../src/server/db";
import {
  synchronizeAllImplementationStatusLedgers,
  validateImplementationStatusLedger,
} from "../src/server/card-catalog";

const checkOnly = process.argv.includes("--check");
const client = await getMongoClient();

try {
  const db = client.db(getMongoDatabaseName());
  if (checkOnly) {
    const setCodes = (await readdir(path.join(process.cwd(), "data", "sets")))
      .filter((fileName) => fileName.endsWith(".json"))
      .map((fileName) => path.basename(fileName, ".json").toUpperCase())
      .sort();
    for (const setCode of setCodes) {
      await validateImplementationStatusLedger(setCode);
    }
    console.log("Implementation-status ledgers are current.");
  } else {
    const ledgers = await synchronizeAllImplementationStatusLedgers(db);
    console.log(
      ledgers
        .map((ledger) => `${ledger.setCode}: ${ledger.cards.length} gameplay identities`)
        .join("\n"),
    );
  }
} finally {
  await client.close();
}
