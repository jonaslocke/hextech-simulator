import type { BaseDocument } from "../db";
import type { Card } from "../catalog";

export type BehaviorTemplateDraftStatus =
  | "suggested"
  | "approved"
  | "rejected"
  | "manual_review"
  | "blocked_by_engine_capability";

export type BehaviorTemplateStatus = "approved";

export type CardGroupingStatus = "suggested" | "validated" | "rejected";

export type CatalogStatus = "draft" | "validated" | "published";

export type RuntimeSupportStatus =
  | "fully_supported"
  | "vanilla_supported"
  | "not_playable"
  | "blocked_by_missing_engine_capability"
  | "needs_behavior_review";

export type CardBehaviorAssignmentStatus =
  | "assigned"
  | "needs_review"
  | "rejected";

export type BehaviorTiming =
  | "action"
  | "reaction"
  | "activated_ability"
  | "static"
  | "trigger"
  | "keyword"
  | "manual_review";

export type BehaviorEffect = {
  type:
    | "draw"
    | "discard"
    | "discardThenDraw"
    | "modifyMight"
    | "dealDamage"
    | "damageEqualToMight"
    | "killUnit"
    | "readyCard"
    | "stunCard"
    | "recallUnit"
    | "moveUnit"
    | "returnToHand"
    | "banishCard"
    | "counterSpell"
    | "channelRunes"
    | "playToken"
    | "attachEquipment"
    | "detachEquipment"
    | "createModifier"
    | "keyword"
    | "manualReview";
  keyword?: string;
  count?: number;
  amount?: number;
  value?: number;
  duration?: "this_turn" | "while_attacking" | "while_defending" | "continuous";
  target?: string;
  tokenName?: string;
  tokenType?: "unit" | "gear";
  clause?: string;
  reason?: string;
};

export type RuntimeBehavior = {
  engineSchemaVersion: 1;
  timing: BehaviorTiming;
  targets: string[];
  effects: BehaviorEffect[];
};

export type BehaviorSourceExample = {
  cardCode: string;
  cardName: string;
  publicCode: string;
  sourceText: string;
};

export type CardImportRunDocument = BaseDocument & {
  setCode: string;
  uploadedFileName: string;
  sourceFileHash: string;
  importedBy: string;
  totalCardsRead: number;
  behaviorDraftsSuggested: number;
  groupingDraftsSuggested: number;
  warnings: string[];
};

export type BehaviorTemplateDocument = BaseDocument & {
  name: string;
  normalizedBehaviorHash: string;
  behavior: RuntimeBehavior;
  sourceExamples: BehaviorSourceExample[];
  status: BehaviorTemplateStatus;
  approvedBy: string;
  approvedAt: string;
};

export type BehaviorTemplateDraftDocument = BaseDocument & {
  importRunId: string;
  name: string;
  sourceClauses: string[];
  matchedCardCodes: string[];
  sourceExamples: BehaviorSourceExample[];
  suggestedBehavior: RuntimeBehavior | null;
  normalizedBehaviorHash: string | null;
  unresolvedClauses: string[];
  confidence: "high" | "medium" | "low";
  status: BehaviorTemplateDraftStatus;
  reviewerNotes: string | null;
  similarApprovedTemplateIds: string[];
};

export type CardVariant = {
  variantCode: string;
  sourceRiftboundId: string | null;
  publicCode: string;
  imageUrl: string | null;
  artist: string | null;
  alternateArt: boolean;
  overnumbered: boolean;
  signature: boolean;
};

export type CanonicalCardDocument = BaseDocument & {
  cardCode: string;
  name: string;
  cleanName: string;
  setCode: string;
  classification: Card["classification"];
  attributes: Card["attributes"];
  text: Card["text"];
  tags: string[];
  defaultImageUrl: string | null;
  variants: CardVariant[];
  catalogStatus: CatalogStatus;
};

export type CardGroupingDraftDocument = BaseDocument & {
  importRunId: string;
  groupId: string;
  cardCode: string;
  status: CardGroupingStatus;
  baseCardPublicCode: string;
  sourcePublicCodes: string[];
  removedVariantPublicCodes: string[];
  canonicalCard: CanonicalCardDocument;
  warnings: string[];
};

export type CardBehaviorAssignmentDocument = BaseDocument & {
  cardCode: string;
  behaviorTemplateId: string | null;
  supportStatus: RuntimeSupportStatus;
  status: CardBehaviorAssignmentStatus;
  reviewerNotes: string | null;
  assignedBy: string;
  assignedAt: string;
};

