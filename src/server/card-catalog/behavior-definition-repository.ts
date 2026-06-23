import { createHash } from "node:crypto";
import type { Db } from "mongodb";
import { buildPrimitiveCatalog, type PrimitiveCatalogEntry } from "./primitive-catalog";
import { analyzeLocalCardSetCorpus } from "./primitive-discovery";

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
  entries?: PrimitiveCatalogEntry[],
  now = new Date().toISOString()
): Promise<{ synchronizedCount: number; removedCount: number }> {
  const definitions = entries ?? (await buildCurrentBehaviorCatalog());
  const collection = db.collection<BehaviorDefinitionMongoDocument>(
    BEHAVIORS_COLLECTION
  );

  for (const entry of definitions) {
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

  const obsoleteIds = await collection
    .find({ _id: { $nin: definitions.map((definition) => definition.id) } })
    .project<{ _id: string }>({ _id: 1 })
    .toArray();
  const obsoleteDefinitionIds = findObsoleteBehaviorDefinitionIds(
    obsoleteIds.map(({ _id }) => _id),
    definitions
  );
  const removedCount = obsoleteDefinitionIds.length > 0
    ? (await collection.deleteMany({ _id: { $in: obsoleteDefinitionIds } }))
        .deletedCount
    : 0;

  return { synchronizedCount: definitions.length, removedCount };
}

export function findObsoleteBehaviorDefinitionIds(
  storedIds: readonly string[],
  expectedEntries: PrimitiveCatalogEntry[]
): string[] {
  const expectedIds = new Set(expectedEntries.map((entry) => entry.id));

  return storedIds.filter((id) => !expectedIds.has(id));
}

export async function loadBehaviorDefinitions(
  db: Db,
  expectedEntries?: PrimitiveCatalogEntry[]
): Promise<PrimitiveCatalogEntry[]> {
  const definitions = expectedEntries ?? (await buildCurrentBehaviorCatalog());
  const documents = await db
    .collection<BehaviorDefinitionMongoDocument>(BEHAVIORS_COLLECTION)
    .find({})
    .sort({ _id: 1 })
    .toArray();
  const documentsById = new Map(documents.map((document) => [document.id, document]));
  const issues = findBehaviorCatalogSyncIssues(documents, definitions);

  if (issues.length > 0) {
    throw new BehaviorCatalogNotInitializedError(issues);
  }

  return definitions.map((entry) => {
    const stored = documentsById.get(entry.id)!;
    const { _id, definitionHash, createdAt, updatedAt, ...definition } = stored;
    void _id;
    void definitionHash;
    void createdAt;
    void updatedAt;

    return { ...definition, examples: [] };
  });
}

export async function buildCurrentBehaviorCatalog(): Promise<
  PrimitiveCatalogEntry[]
> {
  const corpus = await analyzeLocalCardSetCorpus();

  return buildPrimitiveCatalog(corpus.primitives);
}

export function findBehaviorCatalogSyncIssues(
  storedDocuments: ReadonlyArray<Pick<BehaviorDefinitionDocument, "id" | "definitionHash">>,
  expectedEntries: PrimitiveCatalogEntry[]
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
