import type {
  Collection,
  Db,
  Filter,
  OptionalUnlessRequiredId,
  Sort,
  WithId
} from "mongodb";
import type {
  BaseDocument,
  CardCatalogVersionDocument,
  DeckSnapshotDocument,
  GameDocument,
  GameEventDocument,
  MatchDocument
} from "./documents";

export const collectionNames = {
  matches: "matches",
  games: "games",
  gameEvents: "gameEvents",
  deckSnapshots: "deckSnapshots",
  cardCatalogVersions: "cardCatalogVersions"
} as const;

export type MongoStoredDocument<T extends { id: string }> = Omit<T, "_id"> & {
  _id: string;
};

export type DocumentRepository<T extends BaseDocument> = {
  findById(id: string): Promise<T | null>;
  insert(document: T): Promise<void>;
  upsert(document: T): Promise<void>;
};

export type GameEventRepository = DocumentRepository<GameEventDocument> & {
  findByMatchId(matchId: string): Promise<GameEventDocument[]>;
  findByGameId(gameId: string): Promise<GameEventDocument[]>;
  append(event: GameEventDocument): Promise<void>;
};

export type Repositories = {
  matches: DocumentRepository<MatchDocument>;
  games: DocumentRepository<GameDocument>;
  gameEvents: GameEventRepository;
  deckSnapshots: DocumentRepository<DeckSnapshotDocument>;
  cardCatalogVersions: DocumentRepository<CardCatalogVersionDocument>;
};

export function toMongoDocument<T extends { id: string }>(
  document: T
): MongoStoredDocument<T> {
  return {
    ...document,
    _id: document.id
  };
}

export function fromMongoDocument<T extends { id: string }>(
  document: WithId<MongoStoredDocument<T>> | MongoStoredDocument<T> | null
): T | null {
  if (!document) {
    return null;
  }

  const { _id, ...rest } = document;
  void _id;
  return rest as unknown as T;
}

export function createDocumentRepository<T extends BaseDocument>(
  collection: Collection<MongoStoredDocument<T>>
): DocumentRepository<T> {
  return {
    async findById(id) {
      const result = await collection.findOne({
        _id: id
      } as Filter<MongoStoredDocument<T>>);

      return fromMongoDocument<T>(result);
    },

    async insert(document) {
      await collection.insertOne(
        toMongoDocument(document) as OptionalUnlessRequiredId<MongoStoredDocument<T>>
      );
    },

    async upsert(document) {
      await collection.updateOne(
        { _id: document.id } as Filter<MongoStoredDocument<T>>,
        { $set: toMongoDocument(document) },
        { upsert: true }
      );
    }
  };
}

export function createGameEventRepository(
  collection: Collection<MongoStoredDocument<GameEventDocument>>
): GameEventRepository {
  const base = createDocumentRepository<GameEventDocument>(collection);
  const sequenceSort: Sort = { sequence: 1 };

  return {
    ...base,

    async findByMatchId(matchId) {
      const results = await collection
        .find({ matchId } as Filter<MongoStoredDocument<GameEventDocument>>)
        .sort(sequenceSort)
        .toArray();

      return results.map((result) => fromMongoDocument<GameEventDocument>(result)!);
    },

    async findByGameId(gameId) {
      const results = await collection
        .find({ gameId } as Filter<MongoStoredDocument<GameEventDocument>>)
        .sort(sequenceSort)
        .toArray();

      return results.map((result) => fromMongoDocument<GameEventDocument>(result)!);
    },

    async append(event) {
      await base.insert(event);
    }
  };
}

export function createRepositories(db: Db): Repositories {
  return {
    matches: createDocumentRepository<MatchDocument>(
      db.collection(collectionNames.matches)
    ),
    games: createDocumentRepository<GameDocument>(db.collection(collectionNames.games)),
    gameEvents: createGameEventRepository(db.collection(collectionNames.gameEvents)),
    deckSnapshots: createDocumentRepository<DeckSnapshotDocument>(
      db.collection(collectionNames.deckSnapshots)
    ),
    cardCatalogVersions: createDocumentRepository<CardCatalogVersionDocument>(
      db.collection(collectionNames.cardCatalogVersions)
    )
  };
}
