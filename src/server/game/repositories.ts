import type {
  ClientSession,
  Collection,
  Db,
  Filter,
  OptionalUnlessRequiredId,
  WithId,
} from "mongodb";
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
  actionVersion?: number;
  eventIndex?: number;
  payload?: Record<string, string | number | boolean | null>;
};

export type DocumentRepository<T extends BaseDocument> = {
  findById(id: string): Promise<T | null>;
  insert(document: T): Promise<void>;
  upsert(document: T): Promise<void>;
};

export type GameDocumentRepository = DocumentRepository<GameDocument> & {
  upsertIfStateVersion(
    document: GameDocument,
    expectedStateVersion: number,
  ): Promise<boolean>;
};

export type MatchDocumentRepository = DocumentRepository<MatchDocument> & {
  upsertIfStateVersion(
    document: MatchDocument,
    expectedStateVersion: number,
  ): Promise<boolean>;
};

type Stored<T extends { id: string }> = T & { _id: string };

export type GameRepositories = {
  matches: MatchDocumentRepository;
  games: GameDocumentRepository;
  gameEvents: DocumentRepository<GameEventDocument> & {
    findByGameId(gameId: string): Promise<GameEventDocument[]>;
  };
  deckSnapshots: DocumentRepository<DeckSnapshotDocument>;
};

export function createGameRepositories(
  db: Db,
  session?: ClientSession,
): GameRepositories {
  const matches = db.collection<Stored<MatchDocument>>(gameCollectionNames.matches);
  const games = db.collection<Stored<GameDocument>>(gameCollectionNames.games);
  const events = db.collection<Stored<GameEventDocument>>(gameCollectionNames.gameEvents);
  const deckSnapshots = db.collection<Stored<DeckSnapshotDocument>>(gameCollectionNames.deckSnapshots);
  return {
    matches: {
      ...createRepository(matches, session),
      async upsertIfStateVersion(document, expectedStateVersion) {
        const result = await matches.updateOne(
          {
            _id: document.id,
            stateVersion: expectedStateVersion,
          } as Filter<Stored<MatchDocument>>,
          { $set: toStored(document) },
          { session },
        );

        return result.modifiedCount === 1;
      },
    },
    games: {
      ...createRepository(games, session),
      async upsertIfStateVersion(document, expectedStateVersion) {
        const result = await games.updateOne(
          {
            _id: document.id,
            stateVersion: expectedStateVersion,
          } as Filter<Stored<GameDocument>>,
          { $set: toStored(document) },
          { session },
        );

        return result.modifiedCount === 1;
      },
    },
    gameEvents: {
      ...createRepository(events, session),
      async findByGameId(gameId) {
        const documents = await events.find({ gameId } as Filter<Stored<GameEventDocument>>, { session }).sort({ sequence: 1 }).toArray();
        return documents.map((document) => fromStored(document)!);
      }
    },
    deckSnapshots: createRepository(deckSnapshots, session)
  };
}

function createRepository<T extends BaseDocument>(
  collection: Collection<Stored<T>>,
  session?: ClientSession,
): DocumentRepository<T> {
  return {
    async findById(id) {
      const result = await collection.findOne(
        { _id: id } as Filter<Stored<T>>,
        { session },
      );
      return fromStored(result);
    },
    async insert(document) {
      await collection.insertOne(
        toStored(document) as OptionalUnlessRequiredId<Stored<T>>,
        { session },
      );
    },
    async upsert(document) {
      await collection.updateOne(
        { _id: document.id } as Filter<Stored<T>>,
        { $set: toStored(document) },
        { upsert: true, session }
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
