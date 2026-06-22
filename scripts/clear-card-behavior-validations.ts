import { getMongoClient, getMongoDatabaseName } from "../src/server/db";

const CARD_BEHAVIOR_VALIDATIONS_COLLECTION = "cardBehaviorValidations";

if (!process.argv.includes("--confirm")) {
  throw new Error("Refusing to clear card behavior validations without --confirm.");
}

const client = await getMongoClient();

try {
  const result = await client
    .db(getMongoDatabaseName())
    .collection(CARD_BEHAVIOR_VALIDATIONS_COLLECTION)
    .deleteMany({});

  console.log(
    `Deleted ${result.deletedCount} documents from ${CARD_BEHAVIOR_VALIDATIONS_COLLECTION}.`
  );
} finally {
  await client.close();
}
