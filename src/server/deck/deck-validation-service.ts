import type { Db } from "mongodb";
import {
  registeredDeckValidationRequestSchema, deckValidationResponseSchema, fingerprintDeckValidationRequest,
  type DeckValidationReason, type RegisteredDeckValidationRequest, type DeckValidationResponse,
  type DeckValidationSection,
} from "@/shared/deck-validation";
import { loadSourceCardCatalog, type Card, type CardCatalog } from "@/server/catalog";
import { hashCardRulesText } from "@/server/card-catalog";
import { deriveCardCodeFromCard } from "@/server/card-catalog/identity";
import type { DeckConfiguration } from "@/shared/game";
import type { DeckSnapshotDocument } from "@/server/game/repositories";
import type { CardInstance } from "@/server/game/state";
import type { GameCardDefinition } from "@/server/game/schemas";
import {
  inspectSnapshotRuntimeReadiness, loadCanonicalDeckReadiness,
} from "@/server/game/catalog-readiness";
import {
  contextualizeReadinessReasons, evaluateDeckConstruction,
  getRegisteredDeckValidationConstraints, type ConstructionEntry,
} from "./construction";
import { resolveDeckText } from "./validator";

export {
  getDeckValidationConstraints, getRegisteredDeckValidationConstraints,
  isEligibleChosenChampion,
} from "./construction";
export { fingerprintDeckValidationRequest } from "@/shared/deck-validation";

export function buildDeckValidationRequest(input: {
  registeredDeck: DeckSnapshotDocument;
  configuration: DeckConfiguration;
}): RegisteredDeckValidationRequest {
  const legend = input.registeredDeck.instances.find((copy) => copy.source === "legend");
  if (!legend?.registeredCardId) throw new Error("Registered deck is missing its Champion Legend.");
  return registeredDeckValidationRequestSchema.parse({
    input: "registered",
    policy: "riftbound-1v1-match",
    deck: {
      legendRegisteredCardId: legend.registeredCardId,
      chosenChampionRegisteredCardId: input.configuration.chosenChampionRegisteredCardId,
      mainDeckRegisteredCardIds: input.configuration.mainDeckRegisteredCardIds,
      runeDeckRegisteredCardIds: input.registeredDeck.instances
        .filter((copy) => copy.source === "runeDeck").map(requireRegisteredCardId),
      battlefieldRegisteredCardIds: input.registeredDeck.instances
        .filter((copy) => copy.source === "battlefield").map(requireRegisteredCardId),
      sideboardRegisteredCardIds: input.configuration.sideboardRegisteredCardIds,
    },
  });
}

/** Registration context comes from server persistence, never from the request envelope. */
export function validateRegisteredDeckCandidate(input: {
  registeredDeck: DeckSnapshotDocument;
  request: RegisteredDeckValidationRequest;
  readinessReasons?: readonly DeckValidationReason[];
}): DeckValidationResponse {
  const request = registeredDeckValidationRequestSchema.parse(input.request);
  const reasons: DeckValidationReason[] = [];
  const definitionsByCode = new Map(input.registeredDeck.snapshot.cards.map((definition) => [definition.cardCode, definition]));
  const copiesByRegisteredId = new Map(input.registeredDeck.instances.flatMap((copy) =>
    copy.registeredCardId ? [[copy.registeredCardId, copy] as const] : []));
  const sections = {
    legend: [request.deck.legendRegisteredCardId],
    chosenChampion: [request.deck.chosenChampionRegisteredCardId],
    mainDeck: request.deck.mainDeckRegisteredCardIds,
    runeDeck: request.deck.runeDeckRegisteredCardIds,
    battlefields: request.deck.battlefieldRegisteredCardIds,
    sideboard: request.deck.sideboardRegisteredCardIds,
  } satisfies Record<DeckValidationSection, readonly string[]>;
  const entries = (Object.entries(sections) as Array<[DeckValidationSection, readonly string[]]>)
    .flatMap(([section, ids]) => ids.map((registeredCardId): ConstructionEntry => {
      const context = { section, registeredCardId, quantity: 1 };
      const copy = copiesByRegisteredId.get(registeredCardId);
      if (!copy) {
        reasons.push({
          ...context, code: "deck.unknownRegisteredCard",
          message: "A submitted card is not part of this registered deck.",
        });
        return context;
      }
      const definition = definitionsByCode.get(copy.cardCode);
      if (!definition) {
        reasons.push({
          ...context, cardCode: copy.cardCode, code: "deck.cardDefinitionMissing",
          message: "A registered card definition is unavailable.",
        });
        return { ...context, cardCode: copy.cardCode };
      }
      return { ...context, card: definition.card, cardCode: definition.cardCode };
    }));

  validateNoDuplicateRegisteredIds(sections, reasons);
  validateFixedRegisteredSections(input.registeredDeck.instances, sections, reasons);
  validateMutablePartition(input.registeredDeck.instances, sections, reasons);

  const registeredSideboardCount = input.registeredDeck.instances.filter(
    (copy) => copy.source === "sideboard",
  ).length;
  validateSideboardExchange(registeredSideboardCount, sections.sideboard.length, reasons);

  const cards = input.registeredDeck.snapshot.cards.map((definition) => definition.card);
  const construction = evaluateDeckConstruction(entries, {
    catalog: { cards, byName: new Map(cards.map((card) => [card.name, card])) },
  });
  reasons.push(...construction.reasons);
  reasons.push(...contextualizeReadinessReasons(entries, [
    ...inspectSnapshotRuntimeReadiness(input.registeredDeck.snapshot.cards),
    ...(input.readinessReasons ?? []),
  ]));
  return deckValidationResponseSchema.parse({
    ...construction,
    constraints: getRegisteredDeckValidationConstraints(registeredSideboardCount),
    legal: reasons.length === 0,
    reasons,
    fingerprint: fingerprintDeckValidationRequest(request),
  });
}

/** Read-only text validation is independent of saved decks and match registration. */
export async function validateDeckText(input: {
  sourceText: string;
  catalog?: CardCatalog;
} & ({ db: Db } | { loadDatabase: () => Promise<Db> })): Promise<DeckValidationResponse> {
  const catalog = input.catalog ?? await loadSourceCardCatalog();
  const resolution = resolveDeckText(input.sourceText, catalog);
  const codes = resolution.entries.flatMap((entry) => entry.cardCode ? [entry.cardCode] : []);
  const readiness = codes.length
    ? await loadCanonicalDeckReadiness("db" in input ? input.db : await input.loadDatabase(), codes)
    : { cards: [], reasons: [] };
  return validateDeckTextCandidate({
    sourceText: input.sourceText, catalog, readinessReasons: [
      ...readiness.reasons,
      ...inspectDeckSourceFreshness(readiness.cards, resolution.resolvedEntries.map((entry) => entry.card)),
    ],
  });
}

/** Current publication and source evidence for advisory and final registered validation. */
export async function loadRegisteredDeckReadiness(
  db: Db, registeredDeck: DeckSnapshotDocument,
): Promise<DeckValidationReason[]> {
  const [catalog, readiness] = await Promise.all([
    loadSourceCardCatalog(),
    loadCanonicalDeckReadiness(db, registeredDeck.snapshot.cards.map((card) => card.cardCode)),
  ]);
  const reasons = [...readiness.reasons];
  const sourceCards: Card[] = [];
  for (const definition of [...readiness.cards, ...registeredDeck.snapshot.cards]) {
    const source = catalog.byPublicCode.get(definition.card.public_code);
    if (source) sourceCards.push(source);
    else reasons.push({
      code: "deck.sourceIdentityMissing", cardCode: definition.cardCode, canonicalName: definition.card.name,
      message: `Current local source identity is unavailable for ${definition.card.name}.`,
    });
  }
  reasons.push(
    ...inspectDeckSourceFreshness(readiness.cards, sourceCards),
    ...inspectDeckSourceFreshness(registeredDeck.snapshot.cards, sourceCards),
  );
  return [...new Map(reasons.map((reason) => [JSON.stringify(reason), reason])).values()];
}

/** Reuse the catalog hash contract to compare approved evidence with current source rules. */
export function inspectDeckSourceFreshness(
  canonicalCards: readonly GameCardDefinition[], sourceCards: readonly Card[],
): DeckValidationReason[] {
  const sourceByPublicCode = new Map(sourceCards.map((card) => [card.public_code, card]));
  const sourceByCode = new Map(sourceCards.map((card) => [deriveCardCodeFromCard(card), card]));
  return canonicalCards.flatMap((definition): DeckValidationReason[] => {
    const source = sourceByPublicCode.get(definition.card.public_code) ?? sourceByCode.get(definition.cardCode);
    if (!source || hashCardRulesText(source) === definition.sourceTextHash) return [];
    return [{
      code: "deck.canonicalRulesStale", cardCode: definition.cardCode, canonicalName: source.name,
      message: `Canonical rules text differs from the current local source: ${source.name}.`,
    }];
  });
}

/** Pure adapter for callers that already obtained authoritative catalog evidence. */
export function validateDeckTextCandidate(input: {
  sourceText: string;
  catalog: CardCatalog;
  readinessReasons: readonly DeckValidationReason[];
}): DeckValidationResponse {
  const resolution = resolveDeckText(input.sourceText, input.catalog);
  const construction = evaluateDeckConstruction(resolution.entries, { namedEntries: true, catalog: input.catalog });
  const reasons = [
    ...resolution.issues, ...(
      resolution.issues.some((issue) => issue.code === "deck.parse") ? [] : construction.reasons
    ),
    ...contextualizeReadinessReasons(resolution.entries, input.readinessReasons),
  ];
  return deckValidationResponseSchema.parse({
    ...construction, reasons, legal: reasons.length === 0,
    fingerprint: fingerprintDeckValidationRequest({
      input: "text", policy: "riftbound-1v1-match", sourceText: input.sourceText,
    }),
  });
}

export function assertLegalRegisteredDeckConfiguration(input: {
  registeredDeck: DeckSnapshotDocument;
  configuration: DeckConfiguration;
  readinessReasons?: readonly DeckValidationReason[];
}): DeckValidationResponse {
  const response = validateRegisteredDeckCandidate({
    registeredDeck: input.registeredDeck, request: buildDeckValidationRequest(input),
    readinessReasons: input.readinessReasons,
  });
  if (!response.legal) throw new Error(response.reasons.map((reason) => reason.message).join("; "));
  return response;
}

function validateNoDuplicateRegisteredIds(
  sections: Record<DeckValidationSection, readonly string[]>,
  reasons: DeckValidationReason[],
) {
  const seen = new Map<string, DeckValidationSection>();

  for (const [section, ids] of Object.entries(sections) as Array<
    [DeckValidationSection, readonly string[]]
  >) {
    for (const registeredCardId of ids) {
      const existing = seen.get(registeredCardId);
      if (existing) {
        reasons.push({
          code: "deck.duplicateRegisteredCard",
          message: "A registered card copy appears in more than one section.",
          section,
          registeredCardId,
        });
      } else {
        seen.set(registeredCardId, section);
      }
    }
  }
}

function validateFixedRegisteredSections(
  registeredCopies: readonly CardInstance[],
  sections: Record<DeckValidationSection, readonly string[]>,
  reasons: DeckValidationReason[],
) {
  const required = {
    legend: registeredCopies
      .filter((copy) => copy.source === "legend")
      .map(requireRegisteredCardId),
    runeDeck: registeredCopies
      .filter((copy) => copy.source === "runeDeck")
      .map(requireRegisteredCardId),
    battlefields: registeredCopies
      .filter((copy) => copy.source === "battlefield")
      .map(requireRegisteredCardId),
  } satisfies Partial<Record<DeckValidationSection, string[]>>;

  for (const [section, ids] of Object.entries(required) as Array<
    [DeckValidationSection, string[]]
  >) {
    if (!sameIdSet(ids, sections[section])) {
      reasons.push({
        code: "deck.fixedSectionChanged",
        message: "Legend, Runes, and Battlefields cannot be changed.",
        section,
      });
    }
  }
}

function validateMutablePartition(
  registeredCopies: readonly CardInstance[],
  sections: Record<DeckValidationSection, readonly string[]>,
  reasons: DeckValidationReason[],
) {
  const registeredMutableIds = registeredCopies
    .filter((copy) =>
      copy.source === "champion" ||
      copy.source === "mainDeck" ||
      copy.source === "sideboard",
    )
    .map(requireRegisteredCardId);
  const submittedMutableIds = [
    ...sections.chosenChampion,
    ...sections.mainDeck,
    ...sections.sideboard,
  ];

  if (!sameIdSet(registeredMutableIds, submittedMutableIds)) {
    reasons.push({
      code: "deck.mutablePartition",
      message:
        "Chosen Champion, Main Deck, and Sideboard must contain every registered mutable card exactly once.",
    });
  }
}

function validateSideboardExchange(
  registeredSideboardCount: number,
  submittedSideboardCount: number,
  reasons: DeckValidationReason[],
) {
  if (submittedSideboardCount === registeredSideboardCount) return;
  reasons.push({
    code: "deck.sideboardExchange",
    section: "sideboard",
    message:
      `Sideboard must contain exactly ${registeredSideboardCount} cards between games; ` +
      "cards exchanged with the Main Deck are 1-for-1.",
  });
}

function sameIdSet(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((id) => rightSet.has(id));
}

function requireRegisteredCardId(copy: CardInstance): string {
  if (!copy.registeredCardId) {
    throw new Error(`Registered card identity is unavailable: ${copy.instanceId}.`);
  }

  return copy.registeredCardId;
}
