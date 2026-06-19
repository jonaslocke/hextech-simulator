import type { Db, Filter, OptionalUnlessRequiredId } from "mongodb";
import {
  fromMongoDocument,
  toMongoDocument,
  type DocumentRepository,
  type MongoStoredDocument
} from "../db";
import type {
  BehaviorTemplateDocument,
  BehaviorTemplateDraftDocument,
  CardBehaviorAssignmentDocument,
  CardGroupingDraftDocument,
  CardImportRunDocument,
  CanonicalCardDocument
} from "./types";

export const cardCatalogAdminCollectionNames = {
  cardImportRuns: "card_import_runs",
  behaviorTemplates: "behavior_templates",
  behaviorTemplateDrafts: "behavior_template_drafts",
  cardGroupingDrafts: "card_grouping_drafts",
  canonicalCards: "canonical_cards",
  cardBehaviorAssignments: "card_behavior_assignments"
} as const;

export type QueryableDocumentRepository<T extends { id: string }> =
  DocumentRepository<T & { createdAt: string; updatedAt: string }> & {
    findAll(filter?: Partial<T>): Promise<T[]>;
    update(document: T & { createdAt: string; updatedAt: string }): Promise<void>;
  };

export type BehaviorTemplateRepository =
  QueryableDocumentRepository<BehaviorTemplateDocument> & {
    findByHash(hash: string): Promise<BehaviorTemplateDocument | null>;
  };

export type BehaviorTemplateDraftRepository =
  QueryableDocumentRepository<BehaviorTemplateDraftDocument> & {
    findByImportRunId(importRunId: string): Promise<BehaviorTemplateDraftDocument[]>;
  };

export type CardGroupingDraftRepository =
  QueryableDocumentRepository<CardGroupingDraftDocument> & {
    findByImportRunId(importRunId: string): Promise<CardGroupingDraftDocument[]>;
  };

export type CanonicalCardRepository =
  QueryableDocumentRepository<CanonicalCardDocument> & {
    findByCardCode(cardCode: string): Promise<CanonicalCardDocument | null>;
  };

export type CardBehaviorAssignmentRepository =
  QueryableDocumentRepository<CardBehaviorAssignmentDocument> & {
    findByCardCode(cardCode: string): Promise<CardBehaviorAssignmentDocument | null>;
  };

export type CardCatalogAdminRepositories = {
  cardImportRuns: QueryableDocumentRepository<CardImportRunDocument>;
  behaviorTemplates: BehaviorTemplateRepository;
  behaviorTemplateDrafts: BehaviorTemplateDraftRepository;
  cardGroupingDrafts: CardGroupingDraftRepository;
  canonicalCards: CanonicalCardRepository;
  cardBehaviorAssignments: CardBehaviorAssignmentRepository;
};

export function createCardCatalogAdminRepositories(
  db: Db
): CardCatalogAdminRepositories {
  return {
    cardImportRuns: createQueryableRepository<CardImportRunDocument>(
      db,
      cardCatalogAdminCollectionNames.cardImportRuns
    ),
    behaviorTemplates: {
      ...createQueryableRepository<BehaviorTemplateDocument>(
        db,
        cardCatalogAdminCollectionNames.behaviorTemplates
      ),
      async findByHash(hash) {
        const collection = db.collection<MongoStoredDocument<BehaviorTemplateDocument>>(
          cardCatalogAdminCollectionNames.behaviorTemplates
        );
        return fromMongoDocument<BehaviorTemplateDocument>(
          await collection.findOne({
            normalizedBehaviorHash: hash
          } as Filter<MongoStoredDocument<BehaviorTemplateDocument>>)
        );
      }
    },
    behaviorTemplateDrafts: {
      ...createQueryableRepository<BehaviorTemplateDraftDocument>(
        db,
        cardCatalogAdminCollectionNames.behaviorTemplateDrafts
      ),
      async findByImportRunId(importRunId) {
        return createQueryableRepository<BehaviorTemplateDraftDocument>(
          db,
          cardCatalogAdminCollectionNames.behaviorTemplateDrafts
        ).findAll({ importRunId });
      }
    },
    cardGroupingDrafts: {
      ...createQueryableRepository<CardGroupingDraftDocument>(
        db,
        cardCatalogAdminCollectionNames.cardGroupingDrafts
      ),
      async findByImportRunId(importRunId) {
        return createQueryableRepository<CardGroupingDraftDocument>(
          db,
          cardCatalogAdminCollectionNames.cardGroupingDrafts
        ).findAll({ importRunId });
      }
    },
    canonicalCards: {
      ...createQueryableRepository<CanonicalCardDocument>(
        db,
        cardCatalogAdminCollectionNames.canonicalCards
      ),
      async findByCardCode(cardCode) {
        return createQueryableRepository<CanonicalCardDocument>(
          db,
          cardCatalogAdminCollectionNames.canonicalCards
        ).findById(cardCode);
      }
    },
    cardBehaviorAssignments: {
      ...createQueryableRepository<CardBehaviorAssignmentDocument>(
        db,
        cardCatalogAdminCollectionNames.cardBehaviorAssignments
      ),
      async findByCardCode(cardCode) {
        return createQueryableRepository<CardBehaviorAssignmentDocument>(
          db,
          cardCatalogAdminCollectionNames.cardBehaviorAssignments
        ).findById(cardCode);
      }
    }
  };
}

export function createInMemoryCardCatalogAdminRepositories(
): CardCatalogAdminRepositories {
  return {
    cardImportRuns: createInMemoryRepository<CardImportRunDocument>(),
    behaviorTemplates: createInMemoryBehaviorTemplateRepository(),
    behaviorTemplateDrafts: createInMemoryBehaviorTemplateDraftRepository(),
    cardGroupingDrafts: createInMemoryCardGroupingDraftRepository(),
    canonicalCards: createInMemoryCanonicalCardRepository(),
    cardBehaviorAssignments: createInMemoryCardBehaviorAssignmentRepository()
  };
}

function createQueryableRepository<T extends { id: string; createdAt: string; updatedAt: string }>(
  db: Db,
  collectionName: string
): QueryableDocumentRepository<T> {
  const collection = db.collection<MongoStoredDocument<T>>(collectionName);

  return {
    async findById(id) {
      return fromMongoDocument<T>(
        await collection.findOne({
          _id: id
        } as Filter<MongoStoredDocument<T>>)
      );
    },

    async findAll(filter = {}) {
      const results = await collection
        .find(filter as Filter<MongoStoredDocument<T>>)
        .toArray();

      return results.map((result) => fromMongoDocument<T>(result)!);
    },

    async insert(document) {
      await collection.insertOne(
        toMongoDocument(document) as OptionalUnlessRequiredId<MongoStoredDocument<T>>
      );
    },

    async update(document) {
      await collection.replaceOne(
        { _id: document.id } as Filter<MongoStoredDocument<T>>,
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

function createInMemoryRepository<T extends { id: string; createdAt: string; updatedAt: string }>(
): QueryableDocumentRepository<T> {
  const documents = new Map<string, T>();

  return {
    async findById(id) {
      return documents.get(id) ?? null;
    },
    async findAll(filter = {}) {
      return [...documents.values()].filter((document) =>
        Object.entries(filter).every(
          ([key, value]) => document[key as keyof T] === value
        )
      );
    },
    async insert(document) {
      if (documents.has(document.id)) {
        throw new Error(`Document already exists: ${document.id}`);
      }

      documents.set(document.id, document);
    },
    async update(document) {
      if (!documents.has(document.id)) {
        throw new Error(`Document does not exist: ${document.id}`);
      }

      documents.set(document.id, document);
    },
    async upsert(document) {
      documents.set(document.id, document);
    }
  };
}

function createInMemoryBehaviorTemplateRepository(): BehaviorTemplateRepository {
  const repository = createInMemoryRepository<BehaviorTemplateDocument>();

  return {
    ...repository,
    async findByHash(hash) {
      return (
        (await repository.findAll()).find(
          (document) => document.normalizedBehaviorHash === hash
        ) ?? null
      );
    }
  };
}

function createInMemoryBehaviorTemplateDraftRepository(): BehaviorTemplateDraftRepository {
  const repository = createInMemoryRepository<BehaviorTemplateDraftDocument>();

  return {
    ...repository,
    async findByImportRunId(importRunId) {
      return repository.findAll({ importRunId });
    }
  };
}

function createInMemoryCardGroupingDraftRepository(): CardGroupingDraftRepository {
  const repository = createInMemoryRepository<CardGroupingDraftDocument>();

  return {
    ...repository,
    async findByImportRunId(importRunId) {
      return repository.findAll({ importRunId });
    }
  };
}

function createInMemoryCanonicalCardRepository(): CanonicalCardRepository {
  const repository = createInMemoryRepository<CanonicalCardDocument>();

  return {
    ...repository,
    async findByCardCode(cardCode) {
      return repository.findById(cardCode);
    }
  };
}

function createInMemoryCardBehaviorAssignmentRepository(): CardBehaviorAssignmentRepository {
  const repository = createInMemoryRepository<CardBehaviorAssignmentDocument>();

  return {
    ...repository,
    async findByCardCode(cardCode) {
      return repository.findById(cardCode);
    }
  };
}

