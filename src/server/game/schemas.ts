import { z } from "zod";
import { cardSchema } from "../catalog";

const parameterValueSchema = z.union([
  z.string(), z.number(), z.boolean(), z.null()
]);

export const behaviorBindingSchema = z.object({
  behaviorId: z.string().min(1),
  parameters: z.record(parameterValueSchema),
  confidence: z.enum(["high", "medium", "low"]),
  order: z.number().int().nonnegative()
}).strict();

const bindingListSchema = z.array(behaviorBindingSchema);

export const behaviorClauseSchema = z.object({
  id: z.string().min(1),
  sequence: z.number().int().nonnegative(),
  sourceText: z.string(),
  normalizedText: z.string(),
  abilities: bindingListSchema,
  triggers: bindingListSchema,
  conditions: bindingListSchema,
  selectors: bindingListSchema,
  choices: bindingListSchema,
  costs: bindingListSchema,
  timings: bindingListSchema,
  effects: bindingListSchema,
  keywords: bindingListSchema
}).strict();

export const behaviorModelSchema = z.object({
  playTimings: bindingListSchema,
  clauses: z.array(behaviorClauseSchema)
}).strict();

export const gameCardDefinitionSchema = z.object({
  cardCode: z.string().min(1),
  sourceTextHash: z.string().min(1),
  card: cardSchema,
  behaviorModel: behaviorModelSchema
}).strict();

export const deckEntrySchema = z.object({
  section: z.enum([
    "Legend", "Champion", "Runes", "Battlefields", "MainDeck", "Sideboard"
  ]),
  quantity: z.number().int().positive(),
  cardCode: z.string().min(1)
}).strict();

export const deckSnapshotSchema = z.object({
  sourceText: z.string(),
  catalogDigest: z.string().min(1),
  entries: z.array(deckEntrySchema),
  cards: z.array(gameCardDefinitionSchema)
}).strict();

export type BehaviorBinding = z.infer<typeof behaviorBindingSchema>;
export type BehaviorClause = z.infer<typeof behaviorClauseSchema>;
export type BehaviorModel = z.infer<typeof behaviorModelSchema>;
export type GameCardDefinition = z.infer<typeof gameCardDefinitionSchema>;
export type DeckEntry = z.infer<typeof deckEntrySchema>;
export type DeckSnapshot = z.infer<typeof deckSnapshotSchema>;
