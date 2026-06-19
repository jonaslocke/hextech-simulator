import { createHash } from "node:crypto";
import { z } from "zod";
import type { RuntimeBehavior } from "./types";

export const behaviorEffectSchema = z.object({
  type: z.enum([
    "draw",
    "discard",
    "discardThenDraw",
    "modifyMight",
    "dealDamage",
    "damageEqualToMight",
    "killUnit",
    "readyCard",
    "stunCard",
    "recallUnit",
    "moveUnit",
    "returnToHand",
    "banishCard",
    "counterSpell",
    "channelRunes",
    "playToken",
    "attachEquipment",
    "detachEquipment",
    "createModifier",
    "keyword",
    "manualReview"
  ]),
  keyword: z.string().min(1).optional(),
  count: z.number().int().optional(),
  amount: z.number().int().optional(),
  value: z.number().int().optional(),
  duration: z
    .enum(["this_turn", "while_attacking", "while_defending", "continuous"])
    .optional(),
  target: z.string().min(1).optional(),
  tokenName: z.string().min(1).optional(),
  tokenType: z.enum(["unit", "gear"]).optional(),
  clause: z.string().min(1).optional(),
  reason: z.string().min(1).optional()
});

export const runtimeBehaviorSchema = z.object({
  engineSchemaVersion: z.literal(1),
  timing: z.enum([
    "action",
    "reaction",
    "activated_ability",
    "static",
    "trigger",
    "keyword",
    "manual_review"
  ]),
  targets: z.array(z.string().min(1)).default([]),
  effects: z.array(behaviorEffectSchema).min(1)
});

export function parseRuntimeBehavior(input: unknown): RuntimeBehavior {
  return runtimeBehaviorSchema.parse(input);
}

export function computeBehaviorHash(behavior: RuntimeBehavior): string {
  return createHash("sha256")
    .update(JSON.stringify(sortJsonValue(behavior)))
    .digest("hex");
}

export function hasManualReviewEffect(behavior: RuntimeBehavior): boolean {
  return behavior.effects.some((effect) => effect.type === "manualReview");
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortJsonValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, sortJsonValue(entryValue)])
    );
  }

  return value;
}

