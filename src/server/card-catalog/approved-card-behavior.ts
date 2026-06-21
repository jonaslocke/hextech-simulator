import type { Db } from "mongodb";
import { z } from "zod";
import {
  CARD_BEHAVIOR_SCHEMA_VERSION,
  CARD_BEHAVIOR_VALIDATIONS_COLLECTION
} from "./validated-card-lookup";

const primitiveFamilySchema = z.enum([
  "ability",
  "timing",
  "selector",
  "action",
  "modifier",
  "trigger",
  "condition",
  "choice",
  "cost",
  "replacement",
  "prevention",
  "keyword",
  "unsupported"
]);

const primitiveParameterValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null()
]);

export const approvedPrimitiveAssignmentSchema = z.object({
  primitiveId: z.string().min(1),
  family: primitiveFamilySchema,
  sourceText: z.string(),
  parameters: z.record(primitiveParameterValueSchema),
  confidence: z.enum(["high", "medium", "low"])
});

export const approvedBehaviorClauseSchema = z.object({
  id: z.string().min(1),
  sourceText: z.string(),
  normalizedText: z.string(),
  assignments: z.array(approvedPrimitiveAssignmentSchema),
  unsupportedReason: z.string().nullable()
});

export const approvedCardBehaviorInputSchema = z.object({
  cardCode: z.string().min(1),
  publicCode: z.string().min(1),
  name: z.string().min(1),
  setCode: z.string().min(1),
  type: z.string().min(1),
  sourceText: z.string(),
  sourceTextHash: z.string().min(1),
  status: z.enum(["approved", "requires_engine_support", "rejected"]),
  clauses: z.array(approvedBehaviorClauseSchema),
  adminNotes: z.string()
});

export type ApprovedPrimitiveAssignment = z.infer<
  typeof approvedPrimitiveAssignmentSchema
>;
export type ApprovedBehaviorClause = z.infer<typeof approvedBehaviorClauseSchema>;
export type ApprovedCardBehaviorInput = z.infer<
  typeof approvedCardBehaviorInputSchema
>;

export type ApprovedCardBehaviorDocument = ApprovedCardBehaviorInput & {
  id: string;
  schemaVersion: typeof CARD_BEHAVIOR_SCHEMA_VERSION;
  createdAt: string;
  updatedAt: string;
};

type ApprovedCardBehaviorMongoDocument = ApprovedCardBehaviorDocument & {
  _id: string;
};

export async function saveApprovedCardBehavior(
  db: Db,
  input: ApprovedCardBehaviorInput,
  now = new Date().toISOString()
): Promise<ApprovedCardBehaviorDocument> {
  const parsed = approvedCardBehaviorInputSchema.parse(input);
  const collection = db.collection<ApprovedCardBehaviorMongoDocument>(
    CARD_BEHAVIOR_VALIDATIONS_COLLECTION
  );
  const existing = await collection.findOne({ _id: parsed.cardCode });
  const document = buildApprovedCardBehaviorDocument({
    input: parsed,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  });
  const { id, createdAt, ...mutableFields } = document;

  await collection.updateOne(
    { _id: id },
    {
      $set: {
        ...mutableFields,
        id
      },
      $setOnInsert: {
        _id: id,
        createdAt
      }
    },
    { upsert: true }
  );

  return document;
}

export function buildApprovedCardBehaviorDocument({
  createdAt,
  input,
  updatedAt
}: {
  input: ApprovedCardBehaviorInput;
  createdAt: string;
  updatedAt: string;
}): ApprovedCardBehaviorDocument {
  return {
    ...input,
    id: input.cardCode,
    schemaVersion: CARD_BEHAVIOR_SCHEMA_VERSION,
    createdAt,
    updatedAt
  };
}
