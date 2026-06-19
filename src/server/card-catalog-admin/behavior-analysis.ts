import { createHash, randomUUID } from "node:crypto";
import type { Card } from "../catalog";
import { deriveCardCodeFromCard, readSetCodeFromCards } from "./identity";
import {
  computeBehaviorHash,
  parseRuntimeBehavior
} from "./runtime-behavior";
import type {
  BehaviorEffect,
  BehaviorSourceExample,
  BehaviorTemplateDraftDocument,
  CardImportRunDocument,
  RuntimeBehavior
} from "./types";
import type { CardCatalogAdminRepositories } from "./repositories";

export type AnalyzeBehaviorInput = {
  cards: Card[];
  uploadedFileName: string;
  importedBy?: string;
  now?: Date;
  importRunId?: string;
};

export type AnalyzeBehaviorResult = {
  importRun: CardImportRunDocument;
  drafts: BehaviorTemplateDraftDocument[];
};

type BehaviorCandidate = {
  name: string;
  clause: string;
  card: Card;
  behavior: RuntimeBehavior;
  confidence: "high" | "medium" | "low";
  unresolvedClause: string | null;
};

const TIMING_KEYWORDS = new Set(["Action", "Reaction"]);

export async function analyzeBehaviorTemplates(
  repositories: Pick<
    CardCatalogAdminRepositories,
    "cardImportRuns" | "behaviorTemplates" | "behaviorTemplateDrafts"
  >,
  input: AnalyzeBehaviorInput
): Promise<AnalyzeBehaviorResult> {
  const now = input.now ?? new Date();
  const timestamp = now.toISOString();
  const sourceFileHash = hashCards(input.cards);
  const importRunId =
    input.importRunId ?? `import:${sourceFileHash.slice(0, 16)}:${randomUUID()}`;
  const candidates = input.cards.flatMap((card) => detectBehaviorCandidates(card));
  const candidateGroups = groupCandidatesByBehavior(candidates);
  const drafts: BehaviorTemplateDraftDocument[] = [];

  for (const group of candidateGroups) {
    const normalizedBehaviorHash = computeBehaviorHash(group.behavior);
    const existingTemplate =
      await repositories.behaviorTemplates.findByHash(normalizedBehaviorHash);
    const matchedCardCodes = [
      ...new Set(group.candidates.map((candidate) => deriveCardCodeFromCard(candidate.card)))
    ].sort();
    const sourceClauses = [
      ...new Set(group.candidates.map((candidate) => candidate.clause))
    ].sort();
    const unresolvedClauses = [
      ...new Set(
        group.candidates
          .map((candidate) => candidate.unresolvedClause)
          .filter((clause): clause is string => Boolean(clause))
      )
    ].sort();

    drafts.push({
      id: `behavior-draft:${importRunId}:${normalizedBehaviorHash.slice(0, 16)}`,
      createdAt: timestamp,
      updatedAt: timestamp,
      importRunId,
      name: group.name,
      sourceClauses,
      matchedCardCodes,
      sourceExamples: createSourceExamples(group.candidates),
      suggestedBehavior: group.behavior,
      normalizedBehaviorHash,
      unresolvedClauses,
      confidence: lowestConfidence(group.candidates.map((candidate) => candidate.confidence)),
      status: unresolvedClauses.length > 0 ? "manual_review" : "suggested",
      reviewerNotes: null,
      similarApprovedTemplateIds: existingTemplate ? [existingTemplate.id] : []
    });
  }

  const importRun: CardImportRunDocument = {
    id: importRunId,
    createdAt: timestamp,
    updatedAt: timestamp,
    setCode: readSetCodeFromCards(input.cards),
    uploadedFileName: input.uploadedFileName,
    sourceFileHash,
    importedBy: input.importedBy ?? "local-admin",
    totalCardsRead: input.cards.length,
    behaviorDraftsSuggested: drafts.length,
    groupingDraftsSuggested: 0,
    warnings: collectBehaviorAnalysisWarnings(input.cards, drafts)
  };

  await repositories.cardImportRuns.upsert(importRun);
  for (const draft of drafts) {
    await repositories.behaviorTemplateDrafts.upsert(draft);
  }

  return {
    importRun,
    drafts
  };
}

export async function approveBehaviorTemplateDraft(
  repositories: Pick<
    CardCatalogAdminRepositories,
    "behaviorTemplateDrafts" | "behaviorTemplates"
  >,
  input: {
    draftId: string;
    approvedBy?: string;
    now?: Date;
  }
) {
  const draft = await repositories.behaviorTemplateDrafts.findById(input.draftId);

  if (!draft) {
    throw new Error(`Behavior template draft not found: ${input.draftId}`);
  }

  if (!draft.suggestedBehavior) {
    throw new Error("Behavior template draft does not have suggested behavior.");
  }

  if (draft.unresolvedClauses.length > 0) {
    throw new Error("Behavior template draft has unresolved clauses.");
  }

  const behavior = parseRuntimeBehavior(draft.suggestedBehavior);
  const normalizedBehaviorHash = computeBehaviorHash(behavior);
  const existingTemplate =
    await repositories.behaviorTemplates.findByHash(normalizedBehaviorHash);
  const now = input.now ?? new Date();
  const timestamp = now.toISOString();

  if (existingTemplate) {
    const updatedDraft: BehaviorTemplateDraftDocument = {
      ...draft,
      updatedAt: timestamp,
      status: "approved",
      normalizedBehaviorHash,
      similarApprovedTemplateIds: [
        ...new Set([...draft.similarApprovedTemplateIds, existingTemplate.id])
      ]
    };
    await repositories.behaviorTemplateDrafts.upsert(updatedDraft);

    return {
      deduplicated: true,
      template: existingTemplate,
      draft: updatedDraft
    };
  }

  const template = {
    id: `behavior-template:${normalizedBehaviorHash.slice(0, 16)}`,
    createdAt: timestamp,
    updatedAt: timestamp,
    name: draft.name,
    normalizedBehaviorHash,
    behavior,
    sourceExamples: draft.sourceExamples,
    status: "approved" as const,
    approvedBy: input.approvedBy ?? "local-admin",
    approvedAt: timestamp
  };
  const updatedDraft: BehaviorTemplateDraftDocument = {
    ...draft,
    updatedAt: timestamp,
    status: "approved",
    normalizedBehaviorHash,
    similarApprovedTemplateIds: [template.id]
  };

  await repositories.behaviorTemplates.insert(template);
  await repositories.behaviorTemplateDrafts.upsert(updatedDraft);

  return {
    deduplicated: false,
    template,
    draft: updatedDraft
  };
}

export async function updateBehaviorTemplateDraft(
  repositories: Pick<CardCatalogAdminRepositories, "behaviorTemplateDrafts">,
  input: {
    draftId: string;
    patch: Partial<
      Pick<
        BehaviorTemplateDraftDocument,
        | "name"
        | "suggestedBehavior"
        | "unresolvedClauses"
        | "confidence"
        | "status"
        | "reviewerNotes"
      >
    >;
    now?: Date;
  }
) {
  const draft = await repositories.behaviorTemplateDrafts.findById(input.draftId);

  if (!draft) {
    throw new Error(`Behavior template draft not found: ${input.draftId}`);
  }

  const suggestedBehavior = input.patch.suggestedBehavior
    ? parseRuntimeBehavior(input.patch.suggestedBehavior)
    : draft.suggestedBehavior;
  const updated: BehaviorTemplateDraftDocument = {
    ...draft,
    ...input.patch,
    suggestedBehavior,
    normalizedBehaviorHash: suggestedBehavior
      ? computeBehaviorHash(suggestedBehavior)
      : null,
    updatedAt: (input.now ?? new Date()).toISOString()
  };

  await repositories.behaviorTemplateDrafts.upsert(updated);
  return updated;
}

function detectBehaviorCandidates(card: Card): BehaviorCandidate[] {
  const text = card.text.plain.trim();

  if (!text) {
    return [];
  }

  const candidates: BehaviorCandidate[] = [];

  for (const keyword of extractKeywords(text)) {
    candidates.push({
      name: `${keyword} keyword`,
      clause: `[${keyword}]`,
      card,
      behavior: {
        engineSchemaVersion: 1,
        timing: "keyword",
        targets: [],
        effects: [
          {
            type: "keyword",
            keyword
          }
        ]
      },
      confidence: "high",
      unresolvedClause: null
    });
  }

  for (const clause of splitRulesTextIntoClauses(text)) {
    const normalizedClause = normalizeClause(clause);
    const behavior = behaviorFromClause(clause);

    if (behavior) {
      candidates.push({
        name: nameBehavior(behavior),
        clause: normalizedClause,
        card,
        behavior,
        confidence: "medium",
        unresolvedClause: null
      });
      continue;
    }

    if (isReminderOrKeywordOnlyClause(clause)) {
      continue;
    }

    candidates.push({
      name: "Manual review clause",
      clause: normalizedClause,
      card,
      behavior: {
        engineSchemaVersion: 1,
        timing: "manual_review",
        targets: [],
        effects: [
          {
            type: "manualReview",
            clause: normalizedClause,
            reason: "No reusable behavior primitive matched this clause."
          }
        ]
      },
      confidence: "low",
      unresolvedClause: normalizedClause
    });
  }

  return candidates;
}

function behaviorFromClause(clause: string): RuntimeBehavior | null {
  const normalized = normalizeClause(clause);
  const lower = normalized.toLowerCase();
  const timing = lower.includes("[reaction]")
    ? "reaction"
    : lower.includes("[action]")
      ? "action"
      : lower.startsWith("when ") || lower.startsWith("while ") || lower.startsWith("as ")
        ? "trigger"
        : "static";
  const effects: BehaviorEffect[] = [];

  const discardThenDraw = lower.match(/discard #, then draw #/);
  if (discardThenDraw) {
    effects.push({
      type: "discardThenDraw",
      count: 1,
      target: "controller"
    });
  }

  const draw = lower.match(/\bdraw #(?:\W|$)/);
  if (draw && effects.length === 0) {
    effects.push({
      type: "draw",
      count: 1,
      target: "controller"
    });
  }

  if (/\bdiscard #(?:\W|$)/.test(lower) && effects.length === 0) {
    effects.push({
      type: "discard",
      count: 1,
      target: "controller"
    });
  }

  const might = lower.match(/([+-])# :rb_might:/);
  if (might) {
    effects.push({
      type: "modifyMight",
      amount: might[1] === "-" ? -1 : 1,
      duration: lower.includes("this turn") ? "this_turn" : "continuous",
      target: readTargetFromClause(lower)
    });
  }

  if (/damage equal to .*might|deal damage equal/i.test(normalized)) {
    effects.push({
      type: "damageEqualToMight",
      target: readTargetFromClause(lower)
    });
  } else if (/\bdeal #\b/.test(lower)) {
    effects.push({
      type: "dealDamage",
      value: 1,
      target: readTargetFromClause(lower)
    });
  }

  if (/\bkill a unit\b|\bkill target\b/.test(lower)) {
    effects.push({
      type: "killUnit",
      target: readTargetFromClause(lower)
    });
  }

  if (/\benter ready\b|\benters ready\b|\bready\b/.test(lower)) {
    effects.push({
      type: "readyCard",
      target: lower.includes("me") || lower.includes("this") ? "source" : "chosen_card"
    });
  }

  if (/\bstun\b/.test(lower)) {
    effects.push({
      type: "stunCard",
      target: readTargetFromClause(lower)
    });
  }

  if (/\brecall\b/.test(lower)) {
    effects.push({
      type: "recallUnit",
      target: readTargetFromClause(lower)
    });
  }

  if (/return .* hand/.test(lower)) {
    effects.push({
      type: "returnToHand",
      target: readTargetFromClause(lower)
    });
  }

  if (/\bbanish\b/.test(lower)) {
    effects.push({
      type: "banishCard",
      target: readTargetFromClause(lower)
    });
  }

  if (/\bcounter\b/.test(lower)) {
    effects.push({
      type: "counterSpell",
      target: "spell"
    });
  }

  if (/\bchannel # rune/.test(lower)) {
    effects.push({
      type: "channelRunes",
      count: 1,
      target: "controller"
    });
  }

  if (/\bplay .*token\b|\btoken/.test(lower)) {
    effects.push({
      type: "playToken",
      count: 1,
      tokenName: readTokenNameFromClause(normalized),
      tokenType: lower.includes("gear") ? "gear" : "unit"
    });
  }

  if (/\battach\b|\[equip\]/.test(lower)) {
    effects.push({
      type: "attachEquipment",
      target: "friendly_unit"
    });
  }

  if (/\bdetach\b/.test(lower)) {
    effects.push({
      type: "detachEquipment",
      target: "equipment"
    });
  }

  if (/\bmove\b|\bmoved\b/.test(lower)) {
    effects.push({
      type: "moveUnit",
      target: readTargetFromClause(lower)
    });
  }

  if (effects.length === 0) {
    return null;
  }

  return {
    engineSchemaVersion: 1,
    timing,
    targets: [
      ...new Set(
        effects
          .map((effect) => effect.target)
          .filter((target): target is string => Boolean(target))
      )
    ],
    effects
  };
}

function groupCandidatesByBehavior(candidates: BehaviorCandidate[]) {
  const groups = new Map<
    string,
    {
      name: string;
      behavior: RuntimeBehavior;
      candidates: BehaviorCandidate[];
    }
  >();

  for (const candidate of candidates) {
    const hash = computeBehaviorHash(candidate.behavior);
    const existing = groups.get(hash);

    if (existing) {
      existing.candidates.push(candidate);
      continue;
    }

    groups.set(hash, {
      name: candidate.name,
      behavior: candidate.behavior,
      candidates: [candidate]
    });
  }

  return [...groups.values()].sort((left, right) =>
    left.name.localeCompare(right.name)
  );
}

function splitRulesTextIntoClauses(text: string): string[] {
  const withoutReminderParentheticals = text.replace(/\([^)]*\)/g, " ");

  return withoutReminderParentheticals
    .split(/\n+|(?<=\.)\s+|(?<=\])\s*(?=\[)|(?<=\))\s*(?=[A-Z])/)
    .map((clause) => clause.replace(/\s+/g, " ").trim())
    .filter((clause) => clause.length > 0)
    .map((clause) => clause.replace(/\.$/, ""));
}

function extractKeywords(text: string): string[] {
  return [
    ...new Set(
      [...text.matchAll(/\[([^\]]+)\]/g)].map((match) =>
        match[1]!.replace(/\s+\d+$/, "").trim()
      )
    )
  ].filter((keyword) => !TIMING_KEYWORDS.has(keyword));
}

function normalizeClause(clause: string): string {
  return clause
    .replace(/\r/g, "")
    .replace(/\{[^}]+}/g, "{}")
    .replace(/\b\d+\b/g, "#")
    .replace(/\s+/g, " ")
    .trim();
}

function isReminderOrKeywordOnlyClause(clause: string): boolean {
  const trimmed = clause.trim();

  return /^\[[^\]]+\]$/.test(trimmed) || trimmed.length < 3;
}

function readTargetFromClause(lowerClause: string): string {
  if (lowerClause.includes("enemy unit")) {
    return "enemy_unit";
  }

  if (lowerClause.includes("friendly unit")) {
    return "friendly_unit";
  }

  if (lowerClause.includes("a unit")) {
    return "unit";
  }

  if (lowerClause.includes("me") || lowerClause.includes("this")) {
    return "source";
  }

  return "chosen_card";
}

function readTokenNameFromClause(clause: string): string {
  const match = clause.match(/play (?:a |an |one |two |three |four )?([^.]*) token/i);

  return match?.[1]?.trim() || "token";
}

function nameBehavior(behavior: RuntimeBehavior): string {
  const first = behavior.effects[0];

  if (!first) {
    return "Behavior";
  }

  return first.type
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (character) => character.toUpperCase());
}

function createSourceExamples(
  candidates: BehaviorCandidate[]
): BehaviorSourceExample[] {
  const examples = new Map<string, BehaviorSourceExample>();

  for (const candidate of candidates) {
    const cardCode = deriveCardCodeFromCard(candidate.card);

    if (examples.has(cardCode)) {
      continue;
    }

    examples.set(cardCode, {
      cardCode,
      cardName: candidate.card.name,
      publicCode: candidate.card.public_code,
      sourceText: candidate.card.text.plain
    });
  }

  return [...examples.values()].slice(0, 12);
}

function lowestConfidence(confidences: Array<"high" | "medium" | "low">) {
  if (confidences.includes("low")) {
    return "low";
  }

  if (confidences.includes("medium")) {
    return "medium";
  }

  return "high";
}

function collectBehaviorAnalysisWarnings(
  cards: Card[],
  drafts: BehaviorTemplateDraftDocument[]
): string[] {
  const warnings: string[] = [];

  if (cards.length === 0) {
    warnings.push("No cards were found in the uploaded set.");
  }

  if (drafts.length === 0) {
    warnings.push("No behavior templates were suggested.");
  }

  return warnings;
}

function hashCards(cards: Card[]): string {
  return createHash("sha256")
    .update(JSON.stringify(cards.map((card) => card.public_code).sort()))
    .update(JSON.stringify(cards.map((card) => card.text.plain).sort()))
    .digest("hex");
}
