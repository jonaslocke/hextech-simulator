import type { Collection, Db, Filter, OptionalUnlessRequiredId, WithId } from "mongodb";
import type { DeckSnapshotV2 } from "./schemas";
import type { CardInstanceV2, GameDocumentV2, MatchDocumentV2 } from "./state";

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
  instances: CardInstanceV2[];
};

export type GameEventDocumentV2 = BaseDocumentV2 & {
  matchId: string; gameId: string; sequence: number; actorPlayerId: string | null;
  type: string; message: string;
};

export type DocumentRepositoryV2<T extends BaseDocumentV2> = {
  findById(id: string): Promise<T | null>;
  insert(document: T): Promise<void>;
  upsert(document: T): Promise<void>;
};

type Stored<T extends { id: string }> = T & { _id: string };

export type GameV2Repositories = {
  matches: DocumentRepositoryV2<MatchDocumentV2>;
  games: DocumentRepositoryV2<GameDocumentV2>;
  gameEvents: DocumentRepositoryV2<GameEventDocumentV2> & {
    findByGameId(gameId: string): Promise<GameEventDocumentV2[]>;
  };
  deckSnapshots: DocumentRepositoryV2<DeckSnapshotDocumentV2>;
};

export function createGameV2Repositories(db: Db): GameV2Repositories {
  const matches = db.collection<Stored<MatchDocumentV2>>(gameV2CollectionNames.matches);
  const games = db.collection<Stored<GameDocumentV2>>(gameV2CollectionNames.games);
  const events = db.collection<Stored<GameEventDocumentV2>>(gameV2CollectionNames.gameEvents);
  const deckSnapshots = db.collection<Stored<DeckSnapshotDocumentV2>>(gameV2CollectionNames.deckSnapshots);
  return {
    matches: createRepository(matches),
    games: createRepository(games),
    gameEvents: {
      ...createRepository(events),
      async findByGameId(gameId) {
        const documents = await events.find({ gameId } as Filter<Stored<GameEventDocumentV2>>).sort({ sequence: 1 }).toArray();
        return documents.map((document) => fromStored(document)!);
      }
    },
    deckSnapshots: createRepository(deckSnapshots)
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
