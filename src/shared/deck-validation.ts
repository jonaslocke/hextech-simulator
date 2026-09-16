import { z } from "zod";

export const deckValidationSectionSchema = z.enum([
  "legend", "chosenChampion", "mainDeck", "runeDeck", "battlefields", "sideboard",
]);

export const registeredDeckValidationRequestSchema = z.object({
  input: z.literal("registered"),
  deck: z.object({
    legendRegisteredCardId: z.string().min(1),
    chosenChampionRegisteredCardId: z.string().min(1),
    mainDeckRegisteredCardIds: z.array(z.string().min(1)),
    runeDeckRegisteredCardIds: z.array(z.string().min(1)),
    battlefieldRegisteredCardIds: z.array(z.string().min(1)),
    sideboardRegisteredCardIds: z.array(z.string().min(1)),
  }),
  policy: z.literal("riftbound-1v1-match"),
});

export const textDeckValidationRequestSchema = z.object({
  input: z.literal("text"),
  sourceText: z.string(),
  policy: z.literal("riftbound-1v1-match"),
});

export const deckValidationRequestSchema = z.discriminatedUnion("input", [
  registeredDeckValidationRequestSchema,
  textDeckValidationRequestSchema,
]);

export const deckValidationReasonSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  section: deckValidationSectionSchema.optional(),
  line: z.number().int().positive().optional(),
  sourceName: z.string().min(1).optional(),
  registeredCardId: z.string().min(1).optional(),
  canonicalName: z.string().min(1).optional(),
  cardCode: z.string().min(1).optional(),
});

// Transport metadata only. The server Deck Validation feature owns the values.
export const deckValidationConstraintsSchema = z.object({
  legend: z.object({ exact: z.number().int().positive() }),
  chosenChampion: z.object({ exact: z.number().int().positive() }),
  mainDeck: z.object({
    minimum: z.number().int().nonnegative(),
    maximum: z.number().int().nonnegative().nullable(),
    includesChosenChampion: z.boolean(),
  }),
  runeDeck: z.object({ exact: z.number().int().nonnegative() }),
  battlefields: z.object({ exact: z.number().int().nonnegative(), unique: z.boolean() }),
  sideboard: z.object({ maximum: z.number().int().positive() }),
});

export const deckValidationResponseSchema = z.object({
  // Includes construction, registration context, and simulator readiness.
  legal: z.boolean(),
  fingerprint: z.string().min(1),
  reasons: z.array(deckValidationReasonSchema),
  constraints: deckValidationConstraintsSchema,
  summary: z.object({
    activeCardCount: z.number().int().nonnegative(),
    mainDeckCount: z.number().int().nonnegative(),
    sideboardCount: z.number().int().nonnegative(),
    signatureCount: z.number().int().nonnegative(),
    legendCount: z.number().int().nonnegative(),
    chosenChampionCount: z.number().int().nonnegative(),
    runeDeckCount: z.number().int().nonnegative(),
    battlefieldCount: z.number().int().nonnegative(),
  }),
});

export type DeckValidationSection = z.infer<typeof deckValidationSectionSchema>;
export type RegisteredDeckValidationRequest = z.infer<typeof registeredDeckValidationRequestSchema>;
export type TextDeckValidationRequest = z.infer<typeof textDeckValidationRequestSchema>;
export type DeckValidationRequest = z.infer<typeof deckValidationRequestSchema>;
export type DeckValidationReason = z.infer<typeof deckValidationReasonSchema>;
export type DeckValidationConstraints = z.infer<typeof deckValidationConstraintsSchema>;
export type DeckValidationResponse = z.infer<typeof deckValidationResponseSchema>;

/** Correlation only; fingerprints never authorize a configuration by themselves. */
export function fingerprintDeckValidationRequest(request: DeckValidationRequest): string {
  const canonical = request.input === "text"
    ? { input: request.input, policy: request.policy, sourceText: request.sourceText }
    : {
        input: request.input,
        policy: request.policy,
        deck: {
          legendRegisteredCardId: request.deck.legendRegisteredCardId,
          chosenChampionRegisteredCardId: request.deck.chosenChampionRegisteredCardId,
          mainDeckRegisteredCardIds: request.deck.mainDeckRegisteredCardIds,
          runeDeckRegisteredCardIds: request.deck.runeDeckRegisteredCardIds,
          battlefieldRegisteredCardIds: request.deck.battlefieldRegisteredCardIds,
          sideboardRegisteredCardIds: request.deck.sideboardRegisteredCardIds,
        },
      };
  const payload = JSON.stringify(canonical);
  let hash = 2166136261;
  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}
