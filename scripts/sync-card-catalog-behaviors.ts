import { syncBehaviorDefinitions } from "../src/server/card-catalog";
import { getMongoClient, getMongoDatabaseName } from "../src/server/db";

if (!process.argv.includes("--confirm")) {
  throw new Error("Refusing to synchronize behaviors without --confirm.");
}

const client = await getMongoClient();

try {
  const result = await syncBehaviorDefinitions(client.db(getMongoDatabaseName()));
  console.log(
    `Synchronized ${result.synchronizedCount} behavior definitions and removed ${result.removedCount} obsolete definitions.`
  );
} finally {
  await client.close();
}
