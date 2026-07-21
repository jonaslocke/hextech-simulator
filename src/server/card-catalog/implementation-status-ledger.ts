import { access, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Db } from "mongodb";
import { z } from "zod";
import { cardSetFileSchema, type Card } from "../catalog";
import { deriveCardCodeFromCard } from "./identity";
import { selectPrintingGroupRepresentative } from "./printing-selection";

const STATUS_DIRECTORY = path.join(process.cwd(), "data", "implementation-status");
const CANONICAL_CARDS_COLLECTION = "canonicalCards";
const STATUS_ORDER = [
  "unreviewed",
  "classified",
  "implemented",
  "ready_for_manual_validation",
  "manual_family_passed",
  "accepted",
] as const;

export const implementationStatusSchema = z.enum(STATUS_ORDER);
export type ImplementationStatus = z.infer<typeof implementationStatusSchema>;

const statusHistoryEntrySchema = z.object({
  at: z.string().datetime(),
  event: z.enum(["canonical_model_approved", "family_status_updated"]),
  status: implementationStatusSchema,
  familyId: z.string().min(1).optional(),
  note: z.string().min(1).optional(),
}).strict();

const familyStatusSchema = z.object({
  familyId: z.string().min(1),
  status: implementationStatusSchema,
  updatedAt: z.string().datetime(),
  note: z.string().min(1).optional(),
}).strict();

const printingSchema = z.object({
  sourceCardId: z.string().min(1),
  cardCode: z.string().min(1),
  name: z.string().min(1),
}).strict();

const implementationStatusCardSchema = z.object({
  gameplayIdentity: z.string().min(1),
  name: z.string().min(1),
  cleanName: z.string().min(1),
  printingCodes: z.array(z.string().min(1)).min(1),
  sourceCardIds: z.array(z.string().min(1)).default([]),
  printings: z.array(printingSchema).default([]),
  status: implementationStatusSchema,
  canonicalModel: z.object({
    cardCode: z.string().min(1),
    approvedAt: z.string().datetime(),
  }).strict().nullable(),
  familyStatuses: z.array(familyStatusSchema),
  history: z.array(statusHistoryEntrySchema),
  updatedAt: z.string().datetime(),
}).strict();

export const implementationStatusLedgerSchema = z.object({
  schemaVersion: z.literal(1),
  setCode: z.string().regex(/^[A-Z0-9]+$/),
  updatedAt: z.string().datetime(),
  cards: z.array(implementationStatusCardSchema),
}).strict();

export type ImplementationStatusLedger = z.infer<typeof implementationStatusLedgerSchema>;

type CanonicalStatusDocument = {
  cardCode: string;
  updatedAt: string;
};

type StatusUpdate = {
  setCode: string;
  cardCodes: readonly string[];
  status: ImplementationStatus;
  familyId?: string;
  note?: string;
  now?: string;
};

export async function synchronizeImplementationStatusLedger(
  db: Db,
  setCode: string,
  now = new Date().toISOString(),
): Promise<ImplementationStatusLedger> {
  const normalizedSetCode = normalizeSetCode(setCode);
  const [sourceCards, existing, canonicalDocuments] = await Promise.all([
    loadSetCards(normalizedSetCode),
    readImplementationStatusLedger(normalizedSetCode),
    db.collection<CanonicalStatusDocument>(CANONICAL_CARDS_COLLECTION)
      .find({ _id: new RegExp(`^${normalizedSetCode}-`) })
      .project<CanonicalStatusDocument>({ cardCode: 1, updatedAt: 1 })
      .toArray(),
  ]);
  const ledger = buildSynchronizedLedger({
    setCode: normalizedSetCode,
    sourceCards,
    existing,
    canonicalDocuments,
    now,
  });
  await writeImplementationStatusLedger(ledger);
  return ledger;
}

export async function hasImplementationStatusLedgerSource(setCode: string): Promise<boolean> {
  try {
    await access(setSourcePath(normalizeSetCode(setCode)));
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function synchronizeAllImplementationStatusLedgers(
  db: Db,
  now = new Date().toISOString(),
): Promise<ImplementationStatusLedger[]> {
  const setCodes = (await readdir(path.join(process.cwd(), "data", "sets")))
    .filter((fileName) => fileName.endsWith(".json"))
    .map((fileName) => path.basename(fileName, ".json").toUpperCase())
    .sort();
  return Promise.all(
    setCodes.map((setCode) => synchronizeImplementationStatusLedger(db, setCode, now)),
  );
}

export async function updateImplementationStatus(
  db: Db,
  input: StatusUpdate,
): Promise<ImplementationStatusLedger> {
  const now = input.now ?? new Date().toISOString();
  const ledger = await synchronizeImplementationStatusLedger(db, input.setCode, now);
  const requestedCodes = new Set(input.cardCodes.map((cardCode) => cardCode.toUpperCase()));
  const remainingCodes = new Set(requestedCodes);
  const cards = ledger.cards.map((card) => {
    const matchedCodes = card.printingCodes.filter((cardCode) => requestedCodes.has(cardCode));
    if (matchedCodes.length === 0) return card;
    matchedCodes.forEach((cardCode) => remainingCodes.delete(cardCode));

    const familyStatuses = input.familyId
      ? upsertFamilyStatus(card.familyStatuses, {
          familyId: input.familyId,
          status: input.status,
          updatedAt: now,
          ...(input.note ? { note: input.note } : {}),
        })
      : card.familyStatuses;
    const status = highestStatus(card.status, input.status);
    return {
      ...card,
      status,
      familyStatuses,
      updatedAt: now,
      history: appendHistory(card.history, {
        at: now,
        event: "family_status_updated",
        status: input.status,
        ...(input.familyId ? { familyId: input.familyId } : {}),
        ...(input.note ? { note: input.note } : {}),
      }),
    };
  });

  if (remainingCodes.size > 0) {
    throw new Error(
      `Unknown ${normalizeSetCode(input.setCode)} printing code(s): ${[...remainingCodes].join(", ")}`,
    );
  }

  const updated = implementationStatusLedgerSchema.parse({
    ...ledger,
    updatedAt: now,
    cards,
  });
  await writeImplementationStatusLedger(updated);
  return updated;
}

export async function readImplementationStatusLedger(
  setCode: string,
): Promise<ImplementationStatusLedger | null> {
  try {
    const source = await readFile(ledgerPath(normalizeSetCode(setCode)), "utf8");
    return implementationStatusLedgerSchema.parse(JSON.parse(source));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function validateImplementationStatusLedger(
  setCode: string,
): Promise<void> {
  const normalizedSetCode = normalizeSetCode(setCode);
  const [sourceCards, ledger] = await Promise.all([
    loadSetCards(normalizedSetCode),
    readImplementationStatusLedger(normalizedSetCode),
  ]);
  if (!ledger) throw new Error(`Missing implementation-status ledger for ${normalizedSetCode}.`);
  const expected = buildIdentitySeed(sourceCards);
  const actual = new Map(ledger.cards.map((card) => [card.gameplayIdentity, card]));
  if (actual.size !== expected.length) {
    throw new Error(
      `${normalizedSetCode} ledger has ${actual.size} gameplay identities; expected ${expected.length}.`,
    );
  }
  for (const identity of expected) {
    const entry = actual.get(identity.gameplayIdentity);
    if (!entry) {
      throw new Error(`${normalizedSetCode} ledger is missing ${identity.gameplayIdentity}.`);
    }
    if (
      entry.printingCodes.join("|") !== identity.printingCodes.join("|") ||
      entry.sourceCardIds.join("|") !== identity.sourceCardIds.join("|") ||
      JSON.stringify(entry.printings) !== JSON.stringify(identity.printings)
    ) {
      throw new Error(`${normalizedSetCode} ledger printings are stale for ${identity.gameplayIdentity}.`);
    }
  }
}

function buildSynchronizedLedger(input: {
  setCode: string;
  sourceCards: readonly Card[];
  existing: ImplementationStatusLedger | null;
  canonicalDocuments: readonly CanonicalStatusDocument[];
  now: string;
}): ImplementationStatusLedger {
  const existingByIdentity = new Map(
    input.existing?.cards.map((card) => [card.gameplayIdentity, card]) ?? [],
  );
  const existingByPrintingCode = new Map(
    input.existing?.cards.flatMap((card) =>
      card.printingCodes.map((printingCode) => [printingCode, card] as const),
    ) ?? [],
  );
  const existingBySourceCardId = new Map(
    input.existing?.cards.flatMap((card) =>
      card.sourceCardIds.map((sourceCardId) => [sourceCardId, card] as const),
    ) ?? [],
  );
  const canonicalByCode = new Map(
    input.canonicalDocuments.map((document) => [document.cardCode, document]),
  );
  const cards = buildIdentitySeed(input.sourceCards).map((identity) => {
    const prior = existingByIdentity.get(identity.gameplayIdentity) ??
      identity.sourceCardIds.map((id) => existingBySourceCardId.get(id)).find(Boolean) ??
      identity.printingCodes.map((code) => existingByPrintingCode.get(code)).find(Boolean);
    const canonical = identity.printingCodes
      .map((code) => canonicalByCode.get(code))
      .find(Boolean) ?? null;
    const canonicalModel = canonical
      ? { cardCode: canonical.cardCode, approvedAt: canonical.updatedAt }
      : prior?.canonicalModel ?? null;
    const status = canonical
      ? highestStatus(prior?.status ?? "unreviewed", "implemented")
      : prior?.status ?? "unreviewed";
    const canonicalChanged = canonical !== null && (
      prior?.canonicalModel?.cardCode !== canonical.cardCode ||
      prior.canonicalModel.approvedAt !== canonical.updatedAt
    );
    return {
      gameplayIdentity: identity.gameplayIdentity,
      name: identity.name,
      cleanName: identity.cleanName,
      printingCodes: identity.printingCodes,
      sourceCardIds: identity.sourceCardIds,
      printings: identity.printings,
      status,
      canonicalModel,
      familyStatuses: prior?.familyStatuses ?? [],
      history: canonicalChanged
        ? appendHistory(prior?.history ?? [], {
            at: canonical.updatedAt,
            event: "canonical_model_approved",
            status: "implemented",
            note: `Canonical model ${canonical.cardCode} approved.`,
          })
        : prior?.history ?? [],
      updatedAt: canonicalChanged ? canonical.updatedAt : prior?.updatedAt ?? input.now,
    };
  });

  return implementationStatusLedgerSchema.parse({
    schemaVersion: 1,
    setCode: input.setCode,
    updatedAt: input.now,
    cards,
  });
}

function buildIdentitySeed(sourceCards: readonly Card[]) {
  const parentById = new Map(sourceCards.map((card) => [card.id, card.id]));
  const firstByCleanName = new Map<string, Card>();
  const firstByCardCode = new Map<string, Card>();
  for (const card of sourceCards) {
    const cleanName = card.metadata.clean_name ?? card.name;
    const cardCode = deriveCardCodeFromCard(card);
    const cleanNameMatch = firstByCleanName.get(cleanName);
    const cardCodeMatch = firstByCardCode.get(cardCode);
    if (cleanNameMatch) unionCardIds(parentById, card.id, cleanNameMatch.id);
    if (cardCodeMatch) unionCardIds(parentById, card.id, cardCodeMatch.id);
    firstByCleanName.set(cleanName, card);
    firstByCardCode.set(cardCode, card);
  }
  const groups = new Map<string, Card[]>();
  for (const card of sourceCards) {
    const root = findCardId(parentById, card.id);
    groups.set(root, [...(groups.get(root) ?? []), card]);
  }
  return [...groups.values()]
    .map((printings) => {
      // The ledger inventories even unresolved source groups; this representative
      // is only a stable label and is never published as a canonical printing.
      const preferred = selectPrintingGroupRepresentative(printings);
      const cleanName = preferred.metadata.clean_name ?? preferred.name;
      return {
        gameplayIdentity: `${deriveCardCodeFromCard(preferred)}:${cleanName}`,
        name: preferred.name,
        cleanName,
        printingCodes: [...new Set(printings.map(deriveCardCodeFromCard))].sort(),
        sourceCardIds: printings.map((card) => card.id).sort(),
        printings: printings
          .map((card) => ({
            sourceCardId: card.id,
            cardCode: deriveCardCodeFromCard(card),
            name: card.name,
          }))
          .sort((left, right) => left.sourceCardId.localeCompare(right.sourceCardId)),
      };
    })
    .sort((left, right) => left.gameplayIdentity.localeCompare(right.gameplayIdentity));
}

function findCardId(parentById: Map<string, string>, cardId: string): string {
  const parent = parentById.get(cardId);
  if (!parent || parent === cardId) return cardId;
  const root = findCardId(parentById, parent);
  parentById.set(cardId, root);
  return root;
}

function unionCardIds(parentById: Map<string, string>, left: string, right: string) {
  const leftRoot = findCardId(parentById, left);
  const rightRoot = findCardId(parentById, right);
  if (leftRoot !== rightRoot) parentById.set(rightRoot, leftRoot);
}

function upsertFamilyStatus(
  statuses: readonly z.infer<typeof familyStatusSchema>[],
  next: z.infer<typeof familyStatusSchema>,
) {
  const previous = statuses.find((status) => status.familyId === next.familyId);
  return [
    ...statuses.filter((status) => status.familyId !== next.familyId),
    previous
      ? { ...next, status: highestStatus(previous.status, next.status) }
      : next,
  ].sort((left, right) => left.familyId.localeCompare(right.familyId));
}

function appendHistory(
  history: readonly z.infer<typeof statusHistoryEntrySchema>[],
  entry: z.infer<typeof statusHistoryEntrySchema>,
) {
  const last = history.at(-1);
  if (
    last?.event === entry.event &&
    last.status === entry.status &&
    last.familyId === entry.familyId &&
    last.note === entry.note
  ) {
    return [...history];
  }
  return [...history, entry];
}

function highestStatus(left: ImplementationStatus, right: ImplementationStatus) {
  return STATUS_ORDER.indexOf(left) >= STATUS_ORDER.indexOf(right) ? left : right;
}

async function loadSetCards(setCode: string): Promise<Card[]> {
  const source = await readFile(setSourcePath(setCode), "utf8");
  return cardSetFileSchema.parse(JSON.parse(source));
}

async function writeImplementationStatusLedger(ledger: ImplementationStatusLedger) {
  await mkdir(STATUS_DIRECTORY, { recursive: true });
  const destination = ledgerPath(ledger.setCode);
  const temporary = `${destination}.tmp`;
  await writeFile(temporary, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
  await rename(temporary, destination);
}

function ledgerPath(setCode: string) {
  return path.join(STATUS_DIRECTORY, `${setCode.toLowerCase()}.json`);
}

function setSourcePath(setCode: string) {
  return path.join(process.cwd(), "data", "sets", `${setCode.toLowerCase()}.json`);
}

function normalizeSetCode(setCode: string) {
  const normalized = setCode.trim().toUpperCase();
  if (!/^[A-Z0-9]+$/.test(normalized)) {
    throw new Error(`Invalid set code: ${setCode}`);
  }
  return normalized;
}
