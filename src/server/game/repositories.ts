import type { Collection, Db, Filter, OptionalUnlessRequiredId, WithId } from "mongodb";
import type { DeckSnapshot } from "./schemas";
import type { CardInstance, GameDocument, MatchDocument } from "./state";

export const gameCollectionNames = {
  matches: "matches",
  games: "games",
  gameEvents: "gameEvents",
  deckSnapshots: "deckSnapshots"
} as const;

export type BaseDocument = { id: string; createdAt: string; updatedAt: string };
export type DeckSnapshotDocument = BaseDocument & {
  matchId: string | null;
  playerId: string;
  snapshot: DeckSnapshot;
  instances: CardInstance[];
};

export type GameEventDocument = BaseDocument & {
  matchId: string; gameId: string; sequence: number; actorPlayerId: string | null;
  type: string; message: string;
};

export type DocumentRepository<T extends BaseDocument> = {
  findById(id: string): Promise<T | null>;
  insert(document: T): Promise<void>;
  upsert(document: T): Promise<void>;
};

type Stored<T extends { id: string }> = T & { _id: string };

export type GameRepositories = {
  matches: DocumentRepository<MatchDocument>;
  games: DocumentRepository<GameDocument>;
  gameEvents: DocumentRepository<GameEventDocument> & {
    findByGameId(gameId: string): Promise<GameEventDocument[]>;
  };
  deckSnapshots: DocumentRepository<DeckSnapshotDocument>;
};

export function createGameRepositories(db: Db): GameRepositories {
  const matches = db.collection<Stored<MatchDocument>>(gameCollectionNames.matches);
  const games = db.collection<Stored<GameDocument>>(gameCollectionNames.games);
  const events = db.collection<Stored<GameEventDocument>>(gameCollectionNames.gameEvents);
  const deckSnapshots = db.collection<Stored<DeckSnapshotDocument>>(gameCollectionNames.deckSnapshots);
  return {
    matches: createRepository(matches),
    games: createRepository(games),
    gameEvents: {
      ...createRepository(events),
      async findByGameId(gameId) {
        const documents = await events.find({ gameId } as Filter<Stored<GameEventDocument>>).sort({ sequence: 1 }).toArray();
        return documents.map((document) => fromStored(document)!);
      }
    },
    deckSnapshots: createRepository(deckSnapshots)
  };
}

function createRepository<T extends BaseDocument>(
  collection: Collection<Stored<T>>
): DocumentRepository<T> {
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
