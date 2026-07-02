import type {
  Collection,
  Filter,
  OptionalUnlessRequiredId,
  WithId
} from "mongodb";
import type { BaseDocument } from "./documents";

export type MongoStoredDocument<T extends { id: string }> = Omit<T, "_id"> & {
  _id: string;
};

export type DocumentRepository<T extends BaseDocument> = {
  findById(id: string): Promise<T | null>;
  insert(document: T): Promise<void>;
  upsert(document: T): Promise<void>;
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
