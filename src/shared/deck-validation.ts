import { z } from "zod";

export const deckValidationSectionSchema = z.enum([
  "legend",
  "chosenChampion",
  "mainDeck",
  "runeDeck",
  "battlefields",
  "sideboard",
]);

export const deckValidationRequestSchema = z.object({
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

export const deckValidationReasonSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  section: deckValidationSectionSchema.optional(),
  registeredCardId: z.string().min(1).optional(),
  canonicalName: z.string().min(1).optional(),
});

export const deckValidationResponseSchema = z.object({
  legal: z.boolean(),
  fingerprint: z.string().min(1),
  reasons: z.array(deckValidationReasonSchema),
  summary: z.object({
    activeCardCount: z.number().int().nonnegative(),
    mainDeckCount: z.number().int().nonnegative(),
    sideboardCount: z.number().int().nonnegative(),
    signatureCount: z.number().int().nonnegative(),
  }),
});

export type DeckValidationSection = z.infer<
  typeof deckValidationSectionSchema
>;
export type DeckValidationRequest = z.infer<typeof deckValidationRequestSchema>;
export type DeckValidationReason = z.infer<typeof deckValidationReasonSchema>;
export type DeckValidationResponse = z.infer<
  typeof deckValidationResponseSchema
>;
