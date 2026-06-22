import { createHash } from "node:crypto";
import type { Db } from "mongodb";
import { buildPrimitiveCatalog, type PrimitiveCatalogEntry } from "./primitive-catalog";

export const BEHAVIORS_COLLECTION = "behaviors";

export type BehaviorDefinitionDocument = Omit<PrimitiveCatalogEntry, "examples"> & {
  id: string;
  definitionHash: string;
  createdAt: string;
  updatedAt: string;
};

type BehaviorDefinitionMongoDocument = BehaviorDefinitionDocument & {
  _id: string;
};

export class BehaviorCatalogNotInitializedError extends Error {
  readonly code = "behavior_catalog_not_initialized";

  constructor(public readonly details: string[]) {
    super(
      "Behavior definitions are not synchronized. Run npm run catalog:sync-behaviors."
    );
  }
}

export function buildBehaviorDefinitionDocument(
  entry: PrimitiveCatalogEntry,
  now = new Date().toISOString()
): BehaviorDefinitionDocument {
  const definition = stripExamples(entry);

  return {
    ...definition,
    id: entry.id,
    definitionHash: hashBehaviorDefinition(definition),
    createdAt: now,
    updatedAt: now
  };
}

export async function syncBehaviorDefinitions(
  db: Db,
  entries = buildPrimitiveCatalog(),
  now = new Date().toISOString()
): Promise<{ synchronizedCount: number }> {
  const collection = db.collection<BehaviorDefinitionMongoDocument>(
    BEHAVIORS_COLLECTION
  );

  for (const entry of entries) {
    const document = buildBehaviorDefinitionDocument(entry, now);
    const { id, createdAt, ...mutableFields } = document;

    await collection.updateOne(
      { _id: id },
      {
        $set: { ...mutableFields, id },
        $setOnInsert: { _id: id, createdAt }
      },
      { upsert: true }
    );
  }

  return { synchronizedCount: entries.length };
}

export async function loadBehaviorDefinitions(
  db: Db,
  expectedEntries = buildPrimitiveCatalog()
): Promise<PrimitiveCatalogEntry[]> {
  const documents = await db
    .collection<BehaviorDefinitionMongoDocument>(BEHAVIORS_COLLECTION)
    .find({})
    .sort({ _id: 1 })
    .toArray();
  const documentsById = new Map(documents.map((document) => [document.id, document]));
  const issues = findBehaviorCatalogSyncIssues(documents, expectedEntries);

  if (issues.length > 0) {
    throw new BehaviorCatalogNotInitializedError(issues);
  }

  return expectedEntries.map((entry) => {
    const stored = documentsById.get(entry.id)!;
    const { _id, definitionHash, createdAt, updatedAt, ...definition } = stored;
    void _id;
    void definitionHash;
    void createdAt;
    void updatedAt;

    return { ...definition, examples: [] };
  });
}

export function findBehaviorCatalogSyncIssues(
  storedDocuments: ReadonlyArray<Pick<BehaviorDefinitionDocument, "id" | "definitionHash">>,
  expectedEntries = buildPrimitiveCatalog()
): string[] {
  const documentsById = new Map(
    storedDocuments.map((document) => [document.id, document])
  );

  return expectedEntries.flatMap((entry) => {
    const stored = documentsById.get(entry.id);

    if (!stored) {
      return [`Missing behavior definition: ${entry.id}`];
    }

    const expectedHash = buildBehaviorDefinitionDocument(entry).definitionHash;

    return stored.definitionHash === expectedHash
      ? []
      : [`Outdated behavior definition: ${entry.id}`];
  });
}

function stripExamples(
  entry: PrimitiveCatalogEntry
): Omit<PrimitiveCatalogEntry, "examples"> {
  const { examples, ...definition } = entry;
  void examples;
  return definition;
}

function hashBehaviorDefinition(
  definition: Omit<PrimitiveCatalogEntry, "examples">
): string {
  return createHash("sha256").update(JSON.stringify(definition)).digest("hex");
}
