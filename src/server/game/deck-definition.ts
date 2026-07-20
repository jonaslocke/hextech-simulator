import { createHash } from "node:crypto";
import { z } from "zod";
import { deckIdSchema, type DeckId } from "@/shared/game";
import { parseDeckList } from "@/server/deck";

export type { DeckId } from "@/shared/game";

export const DECK_DEFINITIONS_COLLECTION = "deckDefinitions";
export const CORE_DECK_IDS = [
  "lux",
  "annie",
  "master-yi",
  "garen",
  "kaisa",
  "viktor",
  "jinx",
] as const satisfies DeckId[];
export const SIDEBOARD_VALIDATION_DECK_IDS = [
  "lux-s",
  "annie-s",
  "master-yi-s",
  "garen-s",
] as const satisfies DeckId[];
export const OPTIONAL_PLAYABLE_DECK_IDS = [
  "annie-stacked-deck",
  "annie-harrowing",
] as const satisfies DeckId[];
export const DECK_IDS = CORE_DECK_IDS;
export const PLAYABLE_DECK_IDS = deckIdSchema.options;

export const deckDefinitionDocumentSchema = z.object({
  id: deckIdSchema,
  label: z.string().min(1),
  sourceText: z.string().min(1),
  sourceTextHash: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();

export type DeckDefinitionDocument = z.infer<
  typeof deckDefinitionDocumentSchema
>;

export type DeckDefinitionSeed = {
  id: DeckId;
  label: string;
  sourceText: string;
};

export function hashDeckSourceText(sourceText: string): string {
  return createHash("sha256").update(sourceText).digest("hex");
}

export function validateDeckDefinitionDocument(
  input: unknown,
): DeckDefinitionDocument {
  const document = deckDefinitionDocumentSchema.parse(input);
  const expectedHash = hashDeckSourceText(document.sourceText);

  if (document.sourceTextHash !== expectedHash) {
    throw new Error(`Deck definition source hash mismatch: ${document.id}.`);
  }

  parseDeckList(document.sourceText);
  return document;
}
