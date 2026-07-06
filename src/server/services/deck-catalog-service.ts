import type { Db } from "mongodb";
import type { DeckId } from "@/shared/game";
import {
  createDeckDefinitionRepository,
  type DeckDefinitionRepository,
} from "@/server/repositories/deck-definition-repository";
import {
  buildDeckSnapshotFromSource,
  GameCatalogError,
} from "@/server/game/catalog";
import {
  DECK_IDS,
  hashDeckSourceText,
  validateDeckDefinitionDocument,
  type DeckDefinitionDocument,
  type DeckDefinitionSeed,
} from "@/server/game/deck-definition";
import type { DeckSnapshot } from "@/server/game/schemas";

export type PlayableDeckOption = { id: DeckId; label: string };

export class DeckCatalogUnavailableError extends Error {
  readonly code = "deck_catalog_unavailable";

  constructor() {
    super("No playable deck definitions are available.");
  }
}

export async function loadDeckSnapshot(
  db: Db,
  deckId: DeckId,
): Promise<DeckSnapshot> {
  const repository = createDeckDefinitionRepository(db);
  const definition = await repository.findById(deckId);

  if (!definition) {
    throw new GameCatalogError([
      `Missing persisted deck definition: ${deckId}.`,
    ]);
  }

  return buildDeckSnapshotFromSource(db, definition.sourceText);
}

export async function getPlayableDeckOptions(
  db: Db,
  loader: (db: Db, deckId: DeckId) => Promise<DeckSnapshot> = loadDeckSnapshot,
  logger: Pick<Console, "error"> = console,
  repository: DeckDefinitionRepository = createDeckDefinitionRepository(db),
): Promise<PlayableDeckOption[]> {
  const options = await Promise.all(
    DECK_IDS.map(async (id): Promise<PlayableDeckOption | null> => {
      try {
        const definition = await repository.findById(id);
        if (!definition) {
          throw new Error(`Missing persisted deck definition: ${id}.`);
        }
        await loader(db, id);
        return { id, label: definition.label };
      } catch (error) {
        logger.error(`Deck definition "${id}" is unavailable.`, error);
        return null;
      }
    }),
  );
  const playable = options.filter(
    (option): option is PlayableDeckOption => option !== null,
  );

  if (playable.length === 0) {
    throw new DeckCatalogUnavailableError();
  }

  return playable;
}

export type DeckDefinitionSyncResult = {
  insertedCount: number;
  updatedCount: number;
  unchangedCount: number;
};

export async function syncDeckDefinitions(
  db: Db,
  seeds: readonly DeckDefinitionSeed[],
  now = new Date().toISOString(),
): Promise<DeckDefinitionSyncResult> {
  assertCompleteSeedSet(seeds);
  const repository = createDeckDefinitionRepository(db);

  for (const seed of seeds) {
    await buildDeckSnapshotFromSource(db, seed.sourceText);
  }
  const planned = await planDeckDefinitionSync(repository, seeds, now);
  for (const item of planned.writes) {
    await repository.upsert(item);
  }

  return planned.result;
}

export async function planDeckDefinitionSync(
  repository: DeckDefinitionRepository,
  seeds: readonly DeckDefinitionSeed[],
  now: string,
): Promise<{
  writes: DeckDefinitionDocument[];
  result: DeckDefinitionSyncResult;
}> {
  assertCompleteSeedSet(seeds);
  const writes: DeckDefinitionDocument[] = [];
  const result: DeckDefinitionSyncResult = {
    insertedCount: 0,
    updatedCount: 0,
    unchangedCount: 0,
  };

  for (const seed of seeds) {
    const existing = await repository.findById(seed.id);
    const sourceTextHash = hashDeckSourceText(seed.sourceText);

    if (
      existing &&
      existing.label === seed.label &&
      existing.sourceTextHash === sourceTextHash
    ) {
      result.unchangedCount += 1;
      continue;
    }

    const document = validateDeckDefinitionDocument({
      id: seed.id,
      label: seed.label,
      sourceText: seed.sourceText,
      sourceTextHash,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
    writes.push(document);

    if (existing) result.updatedCount += 1;
    else result.insertedCount += 1;
  }

  return { writes, result };
}

function assertCompleteSeedSet(seeds: readonly DeckDefinitionSeed[]): void {
  const seedIds = seeds.map(({ id }) => id);
  const uniqueIds = new Set(seedIds);

  if (
    seeds.length !== DECK_IDS.length ||
    uniqueIds.size !== DECK_IDS.length ||
    DECK_IDS.some((id) => !uniqueIds.has(id))
  ) {
    throw new Error(
      `Deck definition seeds must contain exactly: ${DECK_IDS.join(", ")}.`,
    );
  }
}
