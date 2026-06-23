import { z } from "zod";
import { cardSchema } from "../catalog";

const parameterValueSchema = z.union([
  z.string(), z.number(), z.boolean(), z.null()
]);

export const behaviorBindingV2Schema = z.object({
  behaviorId: z.string().min(1),
  parameters: z.record(parameterValueSchema),
  confidence: z.enum(["high", "medium", "low"]),
  order: z.number().int().nonnegative()
}).strict();

const bindingListSchema = z.array(behaviorBindingV2Schema);

export const behaviorClauseV2Schema = z.object({
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

export const behaviorModelV2Schema = z.object({
  playTimings: bindingListSchema,
  clauses: z.array(behaviorClauseV2Schema)
}).strict();

export const gameCardDefinitionSchema = z.object({
  cardCode: z.string().min(1),
  sourceTextHash: z.string().min(1),
  card: cardSchema,
  behaviorModel: behaviorModelV2Schema
}).strict();

export const deckEntryV2Schema = z.object({
  section: z.enum([
    "Legend", "Champion", "Runes", "Battlefields", "MainDeck", "Sideboard"
  ]),
  quantity: z.number().int().positive(),
  cardCode: z.string().min(1)
}).strict();

export const deckSnapshotV2Schema = z.object({
  sourceText: z.string(),
  catalogDigest: z.string().min(1),
  entries: z.array(deckEntryV2Schema),
  cards: z.array(gameCardDefinitionSchema)
}).strict();

export type BehaviorBindingV2 = z.infer<typeof behaviorBindingV2Schema>;
export type BehaviorClauseV2 = z.infer<typeof behaviorClauseV2Schema>;
export type BehaviorModelV2 = z.infer<typeof behaviorModelV2Schema>;
export type GameCardDefinition = z.infer<typeof gameCardDefinitionSchema>;
export type DeckEntryV2 = z.infer<typeof deckEntryV2Schema>;
export type DeckSnapshotV2 = z.infer<typeof deckSnapshotV2Schema>;

