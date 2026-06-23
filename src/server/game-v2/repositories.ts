import type { Collection, Db, Filter, OptionalUnlessRequiredId, WithId } from "mongodb";
import type { DeckSnapshotV2 } from "./schemas";

export const gameV2CollectionNames = {
  matches: "matchesV2",
  games: "gamesV2",
  gameEvents: "gameEventsV2",
  deckSnapshots: "deckSnapshotsV2"
} as const;

export type BaseDocumentV2 = { id: string; createdAt: string; updatedAt: string };
export type DeckSnapshotDocumentV2 = BaseDocumentV2 & {
  matchId: string | null;
  playerId: string;
  snapshot: DeckSnapshotV2;
};

export type DocumentRepositoryV2<T extends BaseDocumentV2> = {
  findById(id: string): Promise<T | null>;
  insert(document: T): Promise<void>;
  upsert(document: T): Promise<void>;
};

type Stored<T extends { id: string }> = T & { _id: string };

export type GameV2Repositories = {
  matches: DocumentRepositoryV2<BaseDocumentV2>;
  games: DocumentRepositoryV2<BaseDocumentV2>;
  gameEvents: DocumentRepositoryV2<BaseDocumentV2>;
  deckSnapshots: DocumentRepositoryV2<DeckSnapshotDocumentV2>;
};

export function createGameV2Repositories(db: Db): GameV2Repositories {
  return {
    matches: createRepository(db.collection(gameV2CollectionNames.matches)),
    games: createRepository(db.collection(gameV2CollectionNames.games)),
    gameEvents: createRepository(db.collection(gameV2CollectionNames.gameEvents)),
    deckSnapshots: createRepository(db.collection(gameV2CollectionNames.deckSnapshots))
  };
}

function createRepository<T extends BaseDocumentV2>(
  collection: Collection<Stored<T>>
): DocumentRepositoryV2<T> {
  return {
    async findById(id) {
      const result = await collection.findOne({ _id: id } as Filter<Stored<T>>);
      return fromStored(result);
    },
    async insert(document) {
      await collection.insertOne(toStored(document) as OptionalUnlessRequiredId<Stored<T>>);
    },
    async upsert(document) {
      await collection.updateOne(
        { _id: document.id } as Filter<Stored<T>>,
        { $set: toStored(document) },
        { upsert: true }
      );
    }
  };
}

function toStored<T extends { id: string }>(document: T): Stored<T> {
  return { ...document, _id: document.id };
}

function fromStored<T extends { id: string }>(document: WithId<Stored<T>> | null): T | null {
  if (!document) return null;
  const { _id, ...value } = document;
  void _id;
  return value as unknown as T;
}
