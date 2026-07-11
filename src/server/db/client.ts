import { MongoClient } from "mongodb";

let clientPromise: Promise<MongoClient> | null = null;
let indexesPromise: Promise<void> | null = null;

export function getMongoDatabaseName() {
  return process.env.MONGODB_DB_NAME ?? "hextech_simulator";
}

export function getMongoClient() {
  if (!clientPromise) {
    const uri = process.env.MONGODB_URI;

    if (!uri) {
      throw new Error("MONGODB_URI is required to connect to MongoDB.");
    }

    const client = new MongoClient(uri);
    clientPromise = client.connect();
  }

  return clientPromise;
}

export async function getMongoDatabase() {
  const client = await getMongoClient();
  const database = client.db(getMongoDatabaseName());
  indexesPromise ??= ensureIndexes(database);
  await indexesPromise;
  return database;
}

async function ensureIndexes(database: ReturnType<MongoClient["db"]>) {
  await database
    .collection("gameEvents")
    .createIndex({ gameId: 1, sequence: 1 }, { name: "gameEvents_gameId_sequence" });
}
