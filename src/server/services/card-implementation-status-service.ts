import { randomUUID } from "node:crypto";
import {
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const STATUS_DIRECTORY = path.join(process.cwd(), "data", "implementation-status");

const IMPLEMENTATION_STATUS_FILES = {
  OGN: path.join(STATUS_DIRECTORY, "ogn.json"),
  OGS: path.join(STATUS_DIRECTORY, "ogs.json"),
  SFD: path.join(STATUS_DIRECTORY, "sfd.json"),
  UNL: path.join(STATUS_DIRECTORY, "unl.json"),
} as const;

const statusValueSchema = z.string().trim().min(1).max(100);
const noteSchema = z.string().trim().max(2000).nullable().optional();

export const cardImplementationStatusUpdateSchema = z.discriminatedUnion(
  "target",
  [
    z
      .object({
        setCode: z.string().trim().min(1).max(20),
        gameplayIdentity: z.string().trim().min(1).max(500),
        target: z.literal("card"),
        status: statusValueSchema,
        note: noteSchema,
      })
      .strict(),
    z
      .object({
        setCode: z.string().trim().min(1).max(20),
        gameplayIdentity: z.string().trim().min(1).max(500),
        target: z.literal("family"),
        familyId: z.string().trim().min(1).max(500),
        status: statusValueSchema,
        note: noteSchema,
      })
      .strict(),
  ],
);

export type CardImplementationStatusUpdate = z.infer<
  typeof cardImplementationStatusUpdateSchema
>;

const implementationFamilySchema = z
  .object({
    familyId: z.string().min(1),
    status: statusValueSchema,
    updatedAt: z.string().datetime(),
  })
  .passthrough();

const implementationHistoryEntrySchema = z
  .object({
    at: z.string().datetime(),
    event: z.string().min(1),
    status: statusValueSchema,
  })
  .passthrough();

const implementationCardSchema = z
  .object({
    gameplayIdentity: z.string().min(1),
    status: statusValueSchema,
    canonicalModel: z.unknown(),
    familyStatuses: z.array(implementationFamilySchema),
    history: z.array(implementationHistoryEntrySchema),
    updatedAt: z.string().datetime(),
  })
  .passthrough();

const implementationLedgerSchema = z
  .object({
    schemaVersion: z.number(),
    setCode: z.string().min(1),
    updatedAt: z.string().datetime(),
    cards: z.array(implementationCardSchema),
  })
  .passthrough();

type ImplementationLedger = z.infer<typeof implementationLedgerSchema>;
type ImplementationCard = ImplementationLedger["cards"][number];

export class CardImplementationStatusError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly httpStatus = 400,
  ) {
    super(message);
    this.name = "CardImplementationStatusError";
  }
}

export async function updateCardImplementationStatus(
  input: CardImplementationStatusUpdate,
): Promise<{ card: ImplementationCard; setUpdatedAt: string }> {
  const setCode = input.setCode.toUpperCase();
  const ledgerPath = IMPLEMENTATION_STATUS_FILES[setCode as keyof typeof IMPLEMENTATION_STATUS_FILES];

  if (!ledgerPath) {
    throw new CardImplementationStatusError(
      `Unknown implementation-status set code: ${input.setCode}.`,
      "unknown_set_code",
      404,
    );
  }

  const ledger = await readLedger(ledgerPath, setCode);
  const cardIndex = ledger.cards.findIndex(
    (card) => card.gameplayIdentity === input.gameplayIdentity,
  );

  if (cardIndex === -1) {
    throw new CardImplementationStatusError(
      `Card identity ${input.gameplayIdentity} was not found in ${setCode}.`,
      "card_not_found",
      404,
    );
  }

  const currentCard = ledger.cards[cardIndex];
  const now = new Date().toISOString();
  let updatedCard: ImplementationCard;

  if (input.target === "card") {
    updatedCard = {
      ...currentCard,
      status: input.status,
      updatedAt: now,
      history: [
        ...currentCard.history,
        {
          at: now,
          event: "card_status_updated",
          status: input.status,
          ...(input.note ? { note: input.note } : {}),
        },
      ],
    };
  } else {
    const familyIndex = currentCard.familyStatuses.findIndex(
      (family) => family.familyId === input.familyId,
    );

    if (familyIndex === -1) {
      throw new CardImplementationStatusError(
        `Behavior family ${input.familyId} was not found on ${input.gameplayIdentity}.`,
        "family_not_found",
        404,
      );
    }

    const currentFamily = currentCard.familyStatuses[familyIndex];
    const updatedFamily: typeof currentFamily & { note?: string } = {
      ...currentFamily,
      status: input.status,
      updatedAt: now,
    };

    if (input.note) {
      updatedFamily.note = input.note;
    } else {
      delete updatedFamily.note;
    }

    updatedCard = {
      ...currentCard,
      familyStatuses: currentCard.familyStatuses.map((family, index) =>
        index === familyIndex ? updatedFamily : family,
      ),
      updatedAt: now,
      history: [
        ...currentCard.history,
        {
          at: now,
          event: "family_status_updated",
          status: input.status,
          familyId: input.familyId,
          ...(input.note ? { note: input.note } : {}),
        },
      ],
    };
  }

  const updatedLedger = implementationLedgerSchema.parse({
    ...ledger,
    setCode,
    updatedAt: now,
    cards: ledger.cards.map((card, index) =>
      index === cardIndex ? updatedCard : card,
    ),
  });

  await writeLedgerAtomically(ledgerPath, updatedLedger);

  return {
    card: updatedLedger.cards[cardIndex],
    setUpdatedAt: updatedLedger.updatedAt,
  };
}

async function readLedger(ledgerPath: string, setCode: string): Promise<ImplementationLedger> {
  let source: string;

  try {
    source = await readFile(ledgerPath, "utf8");
  } catch {
    throw new CardImplementationStatusError(
      `Unable to read the ${setCode} implementation-status ledger.`,
      "ledger_read_failed",
      500,
    );
  }

  try {
    const ledger = implementationLedgerSchema.parse(JSON.parse(source));

    if (ledger.setCode !== setCode) {
      throw new CardImplementationStatusError(
        `The ${setCode} implementation-status ledger has a mismatched set code.`,
        "ledger_invalid",
        500,
      );
    }

    return ledger;
  } catch {
    throw new CardImplementationStatusError(
      `The ${setCode} implementation-status ledger is invalid.`,
      "ledger_invalid",
      500,
    );
  }
}

async function writeLedgerAtomically(
  ledgerPath: string,
  ledger: ImplementationLedger,
) {
  const temporaryPath = `${ledgerPath}.${process.pid}.${randomUUID()}.tmp`;

  try {
    await writeFile(temporaryPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
    await rename(temporaryPath, ledgerPath);
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
}
