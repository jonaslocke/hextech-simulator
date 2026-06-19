import { createHash, randomUUID } from "node:crypto";
import type { Card } from "../catalog";
import { deriveCardCodeFromCard, readSetCodeFromCards } from "./identity";
import type { CardCatalogAdminRepositories } from "./repositories";
import type {
  CanonicalCardDocument,
  CardBehaviorAssignmentDocument,
  CardGroupingDraftDocument,
  CardImportRunDocument,
  CardVariant,
  RuntimeSupportStatus
} from "./types";

export async function createCardImport(
  repositories: Pick<
    CardCatalogAdminRepositories,
    "cardImportRuns" | "cardGroupingDrafts"
  >,
  input: {
    cards: Card[];
    uploadedFileName: string;
    importedBy?: string;
    now?: Date;
    importRunId?: string;
  }
) {
  const now = input.now ?? new Date();
  const timestamp = now.toISOString();
  const sourceFileHash = hashImportCards(input.cards);
  const importRunId =
    input.importRunId ?? `catalog-import:${sourceFileHash.slice(0, 16)}:${randomUUID()}`;
  const groupingDrafts = createGroupingDrafts({
    cards: input.cards,
    importRunId,
    now
  });
  const importRun: CardImportRunDocument = {
    id: importRunId,
    createdAt: timestamp,
    updatedAt: timestamp,
    setCode: readSetCodeFromCards(input.cards),
    uploadedFileName: input.uploadedFileName,
    sourceFileHash,
    importedBy: input.importedBy ?? "local-admin",
    totalCardsRead: input.cards.length,
    behaviorDraftsSuggested: 0,
    groupingDraftsSuggested: groupingDrafts.length,
    warnings: collectGroupingWarnings(groupingDrafts)
  };

  await repositories.cardImportRuns.upsert(importRun);
  for (const groupingDraft of groupingDrafts) {
    await repositories.cardGroupingDrafts.upsert(groupingDraft);
  }

  return {
    importRun,
    groupingDrafts
  };
}

export async function updateCardGroupingDraft(
  repositories: Pick<
    CardCatalogAdminRepositories,
    "cardGroupingDrafts" | "canonicalCards"
  >,
  input: {
    importRunId?: string;
    groupId: string;
    status?: "suggested" | "validated" | "rejected";
    removedVariantPublicCodes?: string[];
    now?: Date;
  }
) {
  const draft = await repositories.cardGroupingDrafts.findById(input.groupId);

  if (!draft) {
    throw new Error(`Card grouping draft not found: ${input.groupId}`);
  }

  if (input.importRunId && draft.importRunId !== input.importRunId) {
    throw new Error("Card grouping draft does not belong to this import run.");
  }

  const timestamp = (input.now ?? new Date()).toISOString();
  const removedVariantPublicCodes =
    input.removedVariantPublicCodes ?? draft.removedVariantPublicCodes;
  const variants = draft.canonicalCard.variants.filter(
    (variant) => !removedVariantPublicCodes.includes(variant.publicCode)
  );
  const updatedDraft: CardGroupingDraftDocument = {
    ...draft,
    updatedAt: timestamp,
    status: input.status ?? draft.status,
    removedVariantPublicCodes,
    canonicalCard: {
      ...draft.canonicalCard,
      updatedAt: timestamp,
      variants,
      catalogStatus: input.status === "validated" ? "validated" : "draft"
    }
  };

  await repositories.cardGroupingDrafts.upsert(updatedDraft);

  if (updatedDraft.status === "validated") {
    await repositories.canonicalCards.upsert(updatedDraft.canonicalCard);
  }

  return updatedDraft;
}

export async function assignBehaviorToCard(
  repositories: Pick<
    CardCatalogAdminRepositories,
    "canonicalCards" | "behaviorTemplates" | "cardBehaviorAssignments"
  >,
  input: {
    cardCode: string;
    behaviorTemplateId?: string | null;
    supportStatus: RuntimeSupportStatus;
    reviewerNotes?: string | null;
    assignedBy?: string;
    now?: Date;
  }
) {
  const card = await repositories.canonicalCards.findByCardCode(input.cardCode);

  if (!card) {
    throw new Error(`Canonical card not found: ${input.cardCode}`);
  }

  if (input.behaviorTemplateId) {
    const template =
      await repositories.behaviorTemplates.findById(input.behaviorTemplateId);

    if (!template) {
      throw new Error(`Behavior template not found: ${input.behaviorTemplateId}`);
    }
  }

  const timestamp = (input.now ?? new Date()).toISOString();
  const assignment: CardBehaviorAssignmentDocument = {
    id: input.cardCode,
    createdAt:
      (await repositories.cardBehaviorAssignments.findByCardCode(input.cardCode))
        ?.createdAt ?? timestamp,
    updatedAt: timestamp,
    cardCode: input.cardCode,
    behaviorTemplateId: input.behaviorTemplateId ?? null,
    supportStatus: input.supportStatus,
    status:
      input.supportStatus === "needs_behavior_review" ? "needs_review" : "assigned",
    reviewerNotes: input.reviewerNotes ?? null,
    assignedBy: input.assignedBy ?? "local-admin",
    assignedAt: timestamp
  };

  await repositories.cardBehaviorAssignments.upsert(assignment);
  return assignment;
}

function createGroupingDrafts(input: {
  cards: Card[];
  importRunId: string;
  now: Date;
}): CardGroupingDraftDocument[] {
  const timestamp = input.now.toISOString();
  const groups = new Map<string, Card[]>();

  for (const card of input.cards) {
    const cardCode = deriveCardCodeFromCard(card);
    groups.set(cardCode, [...(groups.get(cardCode) ?? []), card]);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([cardCode, cards]) => {
      const baseCard = selectBaseCard(cards);
      const variants = cards
        .filter((card) => card.public_code !== baseCard.public_code)
        .map((card) => createVariant(card));
      const canonicalCard = createCanonicalCardDocument({
        baseCard,
        cardCode,
        variants,
        timestamp
      });
      const groupId = `${input.importRunId}:group:${cardCode}`;

      return {
        id: groupId,
        groupId,
        createdAt: timestamp,
        updatedAt: timestamp,
        importRunId: input.importRunId,
        cardCode,
        status: "suggested",
        baseCardPublicCode: baseCard.public_code,
        sourcePublicCodes: cards.map((card) => card.public_code).sort(),
        removedVariantPublicCodes: [],
        canonicalCard,
        warnings: createGroupWarnings(cards, baseCard)
      };
    });
}

function selectBaseCard(cards: Card[]): Card {
  return (
    cards.find(
      (card) =>
        card.metadata.alternate_art === false &&
        card.metadata.overnumbered === false &&
        card.metadata.signature === false
    ) ??
    cards.find((card) => card.metadata.signature !== true) ??
    cards[0]!
  );
}

function createCanonicalCardDocument(input: {
  baseCard: Card;
  cardCode: string;
  variants: CardVariant[];
  timestamp: string;
}): CanonicalCardDocument {
  return {
    id: input.cardCode,
    createdAt: input.timestamp,
    updatedAt: input.timestamp,
    cardCode: input.cardCode,
    name: input.baseCard.name,
    cleanName: input.baseCard.metadata.clean_name ?? input.baseCard.name,
    setCode: input.baseCard.set.set_id,
    classification: input.baseCard.classification,
    attributes: input.baseCard.attributes,
    text: input.baseCard.text,
    tags: input.baseCard.tags,
    defaultImageUrl: input.baseCard.media.image_url ?? null,
    variants: input.variants,
    catalogStatus: "draft"
  };
}

function createVariant(card: Card): CardVariant {
  return {
    variantCode: card.public_code,
    sourceRiftboundId: card.riftbound_id ?? null,
    publicCode: card.public_code,
    imageUrl: card.media.image_url ?? null,
    artist: card.media.artist ?? null,
    alternateArt: card.metadata.alternate_art ?? false,
    overnumbered: card.metadata.overnumbered ?? false,
    signature: card.metadata.signature ?? false
  };
}

function createGroupWarnings(cards: Card[], baseCard: Card): string[] {
  const warnings: string[] = [];

  if (
    baseCard.metadata.alternate_art !== false ||
    baseCard.metadata.overnumbered !== false ||
    baseCard.metadata.signature !== false
  ) {
    warnings.push("No unflagged base card was found for this card code.");
  }

  if (new Set(cards.map((card) => card.name)).size > 1) {
    warnings.push("Multiple names share this card code.");
  }

  return warnings;
}

function collectGroupingWarnings(drafts: CardGroupingDraftDocument[]): string[] {
  const groupsWithoutBase = drafts.filter((draft) =>
    draft.warnings.includes("No unflagged base card was found for this card code.")
  ).length;

  return groupsWithoutBase === 0
    ? []
    : [`${groupsWithoutBase} card groups do not have an unflagged base card.`];
}

function hashImportCards(cards: Card[]): string {
  return createHash("sha256")
    .update(JSON.stringify(cards.map((card) => card.public_code).sort()))
    .digest("hex");
}
