import { createHash } from "node:crypto";
import { ZodError } from "zod";
import { cardSetFileSchema, type Card } from "../catalog";
import { analyzeCardBehaviorSuggestions, type CardBehaviorSuggestion } from "./behavior-suggestions";
import { deriveCardCodeFromCard } from "./identity";
import type { PrimitiveCatalogEntry } from "./primitive-catalog";
import type {
  ExistingCanonicalCardLookup,
  PersistedCanonicalCardSummary
} from "./canonical-card-repository";

export type ExistingCardCatalogState =
  | "new"
  | "already_persisted"
  | "changed_since_persisted";

export type CardCatalogImportPreviewCard = {
  card: Card;
  cardCode: string;
  publicCode: string;
  name: string;
  type: string;
  setCode: string;
  rulesText: string;
  sourceTextHash: string;
  existingCatalog: {
    state: ExistingCardCatalogState;
    persisted: PersistedCanonicalCardSummary | null;
  };
  suggestion: CardBehaviorSuggestion | null;
  isVanilla: boolean;
};

export type CardCatalogImportPreviewResult = {
  sourceLabel: string;
  summary: {
    uploadedCardCount: number;
    suggestedCardCount: number;
    vanillaCardCount: number;
    newCardCount: number;
    alreadyPersistedCardCount: number;
    changedSincePersistedCardCount: number;
    unsupportedCardCount: number;
    ambiguousCardCount: number;
    requiresEngineSupportCardCount: number;
    missingRequiredParameterCount: number;
  };
  primitiveCatalog: PrimitiveCatalogEntry[];
  cards: CardCatalogImportPreviewCard[];
};

export class CardCatalogImportPreviewError extends Error {
  constructor(
    message: string,
    public readonly code: "invalid_json" | "invalid_card_set",
    public readonly details: string[] = []
  ) {
    super(message);
  }
}

export async function previewCardCatalogImport(input: {
  sourceLabel: string;
  rawJson: string;
  behaviorCatalog: PrimitiveCatalogEntry[];
  existingCardLookup?: ExistingCanonicalCardLookup;
}): Promise<CardCatalogImportPreviewResult> {
  const cards = parseUploadedCardSetJson(input.rawJson);
  const suggestionReport = analyzeCardBehaviorSuggestions(
    cards,
    [input.sourceLabel],
    input.behaviorCatalog
  );
  const suggestionsByCardCode = new Map(
    suggestionReport.cards.map((suggestion) => [suggestion.cardCode, suggestion])
  );
  const previewCardsWithoutExistingState = cards.map((card) => {
    const cardCode = deriveCardCodeFromCard(card);

    return {
      card,
      cardCode,
      sourceTextHash: hashCardRulesText(card)
    };
  });
  const existingCards =
    input.existingCardLookup?.(
      previewCardsWithoutExistingState.map((card) => card.cardCode)
    ) ?? Promise.resolve(new Map<string, PersistedCanonicalCardSummary>());
  const existingCardsByCode = await existingCards;
  const previewCards = previewCardsWithoutExistingState.map(
    ({ card, cardCode, sourceTextHash }) => {
      const persisted = existingCardsByCode.get(cardCode) ?? null;
      const suggestion = suggestionsByCardCode.get(cardCode) ?? null;

      return {
        card,
        cardCode,
        publicCode: card.public_code,
        name: card.name,
        type: card.classification.type,
        setCode: card.set.set_id,
        rulesText: card.text.plain,
        sourceTextHash,
        existingCatalog: {
          state: readExistingCatalogState(persisted, sourceTextHash),
          persisted
        },
        suggestion,
        isVanilla: card.text.plain.trim().length === 0 && suggestion === null
      } satisfies CardCatalogImportPreviewCard;
    }
  );

  return {
    sourceLabel: input.sourceLabel,
    summary: {
      uploadedCardCount: cards.length,
      suggestedCardCount: suggestionReport.summary.suggestedCardCount,
      vanillaCardCount: previewCards.filter((card) => card.isVanilla).length,
      newCardCount: previewCards.filter(
        (card) => card.existingCatalog.state === "new"
      ).length,
      alreadyPersistedCardCount: previewCards.filter(
        (card) => card.existingCatalog.state === "already_persisted"
      ).length,
      changedSincePersistedCardCount: previewCards.filter(
        (card) => card.existingCatalog.state === "changed_since_persisted"
      ).length,
      unsupportedCardCount: suggestionReport.summary.unsupportedCardCount,
      ambiguousCardCount: suggestionReport.summary.ambiguousCardCount,
      requiresEngineSupportCardCount:
        suggestionReport.summary.requiresEngineSupportCardCount,
      missingRequiredParameterCount:
        suggestionReport.summary.missingRequiredParameterCount
    },
    primitiveCatalog: suggestionReport.primitiveCatalog,
    cards: previewCards
  };
}

function parseUploadedCardSetJson(rawJson: string): Card[] {
  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(rawJson);
  } catch (caught) {
    throw new CardCatalogImportPreviewError(
      caught instanceof Error ? caught.message : "Uploaded file is not valid JSON.",
      "invalid_json"
    );
  }

  try {
    return cardSetFileSchema.parse(parsedJson);
  } catch (caught) {
    if (caught instanceof ZodError) {
      throw new CardCatalogImportPreviewError(
        "Uploaded JSON does not match the expected card set format.",
        "invalid_card_set",
        caught.issues.slice(0, 12).map((issue) => issue.message)
      );
    }

    throw caught;
  }
}

export function hashCardRulesText(card: Card): string {
  return createHash("sha256")
    .update(normalizeRulesText(card.text.plain))
    .digest("hex");
}

function normalizeRulesText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function readExistingCatalogState(
  persisted: PersistedCanonicalCardSummary | null,
  sourceTextHash: string
): ExistingCardCatalogState {
  if (!persisted) {
    return "new";
  }

  if (persisted.sourceTextHash && persisted.sourceTextHash !== sourceTextHash) {
    return "changed_since_persisted";
  }

  return "already_persisted";
}
