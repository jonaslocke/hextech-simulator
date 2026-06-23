import { CANONICAL_CARDS_COLLECTION } from "../src/server/card-catalog";
import { getMongoClient, getMongoDatabaseName } from "../src/server/db";

if (!process.argv.includes("--confirm")) {
  throw new Error("Refusing to reset canonical cards without --confirm.");
}

const client = await getMongoClient();

try {
  const result = await client
    .db(getMongoDatabaseName())
    .collection(CANONICAL_CARDS_COLLECTION)
    .deleteMany({});

  console.log(
    `Deleted ${result.deletedCount} documents from ${CANONICAL_CARDS_COLLECTION}.`
  );
} finally {
  await client.close();
}
