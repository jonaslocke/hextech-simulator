import { getMongoClient, getMongoDatabaseName } from "../src/server/db";

if (!process.argv.includes("--confirm")) {
  throw new Error(
    "Refusing to reset game runtime collections without --confirm."
  );
}

const client = await getMongoClient();

try {
  const database = client.db(getMongoDatabaseName());
  const results = await Promise.all([
    database.collection("gameEvents").deleteMany({}),
    database.collection("games").deleteMany({}),
    database.collection("matches").deleteMany({}),
    database.collection("deckSnapshots").deleteMany({
      matchId: { $ne: null }
    })
  ]);
  const names = ["gameEvents", "games", "matches", "match deckSnapshots"];
  results.forEach((result, index) => {
    console.log(`Deleted ${result.deletedCount} documents from ${names[index]}.`);
  });
} finally {
  await client.close();
}
