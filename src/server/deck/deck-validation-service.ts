import {
  deckValidationRequestSchema,
  deckValidationResponseSchema,
  type DeckValidationReason,
  type DeckValidationRequest,
  type DeckValidationResponse,
  type DeckValidationSection,
} from "@/shared/deck-validation";
import type { Card } from "@/server/catalog";
import type { DeckConfiguration } from "@/shared/game";
import { registeredBattlefieldIds } from "@/server/game/game-factory";
import type { DeckSnapshotDocument } from "@/server/game/repositories";
import type { CardInstance } from "@/server/game/state";

const ACTIVE_CARD_COUNT = 40;
const MAIN_DECK_COPY_COUNT = 39;
const RUNE_DECK_COUNT = 12;
const BATTLEFIELD_COUNT = 3;
const SIDEBOARD_CAPACITY = 8;
const MAIN_DECK_TYPES = new Set(["Gear", "Spell", "Unit"]);

type ResolvedCopy = {
  card: Card;
  copy: CardInstance;
  canonicalName: string;
  registeredCardId: string;
};

export function buildDeckValidationRequest(input: {
  registeredDeck: DeckSnapshotDocument;
  configuration: DeckConfiguration;
}): DeckValidationRequest {
  const legend = input.registeredDeck.instances.find(
    (copy) => copy.source === "legend",
  );
  if (!legend?.registeredCardId) {
    throw new Error("Registered deck is missing its Champion Legend.");
  }

  return deckValidationRequestSchema.parse({
    policy: "riftbound-1v1-match",
    deck: {
      legendRegisteredCardId: legend.registeredCardId,
      chosenChampionRegisteredCardId:
        input.configuration.chosenChampionRegisteredCardId,
      mainDeckRegisteredCardIds: input.configuration.mainDeckRegisteredCardIds,
      runeDeckRegisteredCardIds: input.registeredDeck.instances
        .filter((copy) => copy.source === "runeDeck")
        .map(requireRegisteredCardId),
      battlefieldRegisteredCardIds: registeredBattlefieldIds(
        input.registeredDeck.instances,
      ),
      sideboardRegisteredCardIds:
        input.configuration.sideboardRegisteredCardIds,
    },
  });
}

export function validateRegisteredDeckCandidate(input: {
  registeredDeck: DeckSnapshotDocument;
  request: DeckValidationRequest;
  allowCrossDomainCards?: boolean;
}): DeckValidationResponse {
  const request = deckValidationRequestSchema.parse(input.request);
  const fingerprint = fingerprintDeckValidationRequest(request);
  const reasons: DeckValidationReason[] = [];
  const definitionsByCode = new Map(
    input.registeredDeck.snapshot.cards.map((definition) => [
      definition.cardCode,
      definition,
    ]),
  );
  const copiesByRegisteredId = new Map(
    input.registeredDeck.instances.flatMap((copy) =>
      copy.registeredCardId ? [[copy.registeredCardId, copy] as const] : [],
    ),
  );

  const sections = {
    legend: [request.deck.legendRegisteredCardId],
    chosenChampion: [request.deck.chosenChampionRegisteredCardId],
    mainDeck: request.deck.mainDeckRegisteredCardIds,
    runeDeck: request.deck.runeDeckRegisteredCardIds,
    battlefields: request.deck.battlefieldRegisteredCardIds,
    sideboard: request.deck.sideboardRegisteredCardIds,
  } as const;

  const resolved = Object.fromEntries(
    Object.entries(sections).map(([section, ids]) => [
      section,
      ids.flatMap((registeredCardId) => {
        const copy = copiesByRegisteredId.get(registeredCardId);
        if (!copy) {
          reasons.push({
            code: "deck.unknownRegisteredCard",
            message: "A submitted card is not part of this registered deck.",
            section: section as DeckValidationSection,
            registeredCardId,
          });
          return [];
        }

        const definition = definitionsByCode.get(copy.cardCode);
        if (!definition) {
          reasons.push({
            code: "deck.cardDefinitionMissing",
            message: "A registered card definition is unavailable.",
            section: section as DeckValidationSection,
            registeredCardId,
          });
          return [];
        }

        return [
          {
            card: definition.card,
            copy,
            canonicalName: canonicalGameplayName(definition.card),
            registeredCardId,
          },
        ];
      }),
    ]),
  ) as Record<DeckValidationSection, ResolvedCopy[]>;

  validateNoDuplicateRegisteredIds(sections, reasons);
  validateFixedRegisteredSections(input.registeredDeck.instances, sections, reasons);
  validateMutablePartition(input.registeredDeck.instances, sections, reasons);
  validateCounts(sections, reasons);
  validateTypePlacement(resolved, reasons);
  validateChampionCompatibility(resolved, reasons);
  if (!input.allowCrossDomainCards) {
    validateDomainIdentity(resolved, reasons);
  }
  const signatureCount = validateSignatureCards(resolved, reasons);
  validateCopyLimits(resolved, reasons);

  return deckValidationResponseSchema.parse({
    legal: reasons.length === 0,
    fingerprint,
    reasons,
    summary: {
      activeCardCount: sections.mainDeck.length + sections.chosenChampion.length,
      mainDeckCount: sections.mainDeck.length,
      sideboardCount: sections.sideboard.length,
      signatureCount,
    },
  });
}

export function assertLegalRegisteredDeckConfiguration(input: {
  registeredDeck: DeckSnapshotDocument;
  configuration: DeckConfiguration;
  allowCrossDomainCards?: boolean;
}): DeckValidationResponse {
  const response = validateRegisteredDeckCandidate({
    registeredDeck: input.registeredDeck,
    request: buildDeckValidationRequest(input),
    allowCrossDomainCards: input.allowCrossDomainCards,
  });
  if (!response.legal) {
    throw new Error(
      response.reasons.map((reason) => reason.message).join("; "),
    );
  }

  return response;
}

export function fingerprintDeckValidationRequest(
  request: DeckValidationRequest,
): string {
  const payload = JSON.stringify(canonicalizeDeckValidationRequest(request));
  let hash = 2166136261;

  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16);
}

function canonicalizeDeckValidationRequest(request: DeckValidationRequest) {
  return {
    policy: request.policy,
    deck: {
      legendRegisteredCardId: request.deck.legendRegisteredCardId,
      chosenChampionRegisteredCardId:
        request.deck.chosenChampionRegisteredCardId,
      mainDeckRegisteredCardIds: [...request.deck.mainDeckRegisteredCardIds],
      runeDeckRegisteredCardIds: [...request.deck.runeDeckRegisteredCardIds],
      battlefieldRegisteredCardIds: [
        ...request.deck.battlefieldRegisteredCardIds,
      ],
      sideboardRegisteredCardIds: [...request.deck.sideboardRegisteredCardIds],
    },
  };
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

function validateCounts(
  sections: Record<DeckValidationSection, readonly string[]>,
  reasons: DeckValidationReason[],
) {
  if (sections.legend.length !== 1) {
    reasons.push({
      code: "deck.legendCount",
      message: "Deck must contain exactly one Champion Legend.",
      section: "legend",
    });
  }

  if (sections.chosenChampion.length !== 1) {
    reasons.push({
      code: "deck.championCount",
      message: "Deck must contain exactly one Chosen Champion Unit.",
      section: "chosenChampion",
    });
  }

  if (sections.mainDeck.length !== MAIN_DECK_COPY_COUNT) {
    reasons.push({
      code: "deck.mainDeckSize",
      message:
        "Main Deck must contain exactly 39 cards because the Chosen Champion is tracked separately.",
      section: "mainDeck",
    });
  }

  if (sections.mainDeck.length + sections.chosenChampion.length !== ACTIVE_CARD_COUNT) {
    reasons.push({
      code: "deck.activeDeckSize",
      message: "Active deck must contain exactly 40 cards including the Chosen Champion.",
      section: "mainDeck",
    });
  }

  if (sections.runeDeck.length !== RUNE_DECK_COUNT) {
    reasons.push({
      code: "deck.runeCount",
      message: "Rune deck must contain exactly 12 Rune cards.",
      section: "runeDeck",
    });
  }

  if (sections.battlefields.length !== BATTLEFIELD_COUNT) {
    reasons.push({
      code: "deck.battlefieldCount",
      message: "Deck must contain exactly 3 registered Battlefields.",
      section: "battlefields",
    });
  }

  if (sections.sideboard.length > SIDEBOARD_CAPACITY) {
    reasons.push({
      code: "deck.sideboardSize",
      message: "Sideboard can contain at most 8 cards.",
      section: "sideboard",
    });
  }
}

function validateTypePlacement(
  resolved: Record<DeckValidationSection, ResolvedCopy[]>,
  reasons: DeckValidationReason[],
) {
  for (const copy of resolved.legend) {
    if (copy.card.classification.type !== "Legend") {
      addTypePlacementIssue(copy, "legend", reasons);
    }
  }

  for (const copy of resolved.chosenChampion) {
    if (
      copy.card.classification.type !== "Unit" ||
      copy.card.classification.supertype !== "Champion"
    ) {
      addTypePlacementIssue(copy, "chosenChampion", reasons);
    }
  }

  for (const copy of resolved.runeDeck) {
    if (copy.card.classification.type !== "Rune") {
      addTypePlacementIssue(copy, "runeDeck", reasons);
    }
  }

  for (const copy of resolved.battlefields) {
    if (copy.card.classification.type !== "Battlefield") {
      addTypePlacementIssue(copy, "battlefields", reasons);
    }
  }

  for (const section of ["mainDeck", "sideboard"] as const) {
    for (const copy of resolved[section]) {
      if (!MAIN_DECK_TYPES.has(copy.card.classification.type)) {
        addTypePlacementIssue(copy, section, reasons);
      }
    }
  }
}

function validateChampionCompatibility(
  resolved: Record<DeckValidationSection, ResolvedCopy[]>,
  reasons: DeckValidationReason[],
) {
  const legend = resolved.legend[0];
  const champion = resolved.chosenChampion[0];
  if (!legend || !champion) return;

  const legendTags = new Set(legend.card.tags);
  const hasMatchingTag = champion.card.tags.some((tag) => legendTags.has(tag));

  if (!hasMatchingTag) {
    reasons.push({
      code: "deck.championTag",
      message: `Chosen Champion "${champion.card.name}" does not match the Champion Legend tag.`,
      section: "chosenChampion",
      registeredCardId: champion.registeredCardId,
      canonicalName: champion.canonicalName,
    });
  }
}

function validateDomainIdentity(
  resolved: Record<DeckValidationSection, ResolvedCopy[]>,
  reasons: DeckValidationReason[],
) {
  const legend = resolved.legend[0];
  const champion = resolved.chosenChampion[0];
  if (!legend || !champion) return;

  const legendDomain = new Set(legend.card.classification.domain);

  for (const section of ["chosenChampion", "mainDeck", "sideboard"] as const) {
    for (const copy of resolved[section]) {
      validateCardDomains(copy, legendDomain, section, "Legend", reasons);
    }
  }

  for (const copy of resolved.runeDeck) {
    validateCardDomains(copy, legendDomain, "runeDeck", "Legend", reasons);
  }
}

function validateSignatureCards(
  resolved: Record<DeckValidationSection, ResolvedCopy[]>,
  reasons: DeckValidationReason[],
): number {
  const legend = resolved.legend[0];
  if (!legend) return 0;

  const legendTags = new Set(legend.card.tags);
  let signatureCount = 0;

  for (const copy of [
    ...resolved.chosenChampion,
    ...resolved.mainDeck,
    ...resolved.sideboard,
  ]) {
    const isSignature =
      copy.card.classification.supertype === "Signature" ||
      copy.card.metadata.signature === true;
    if (!isSignature) continue;

    signatureCount += 1;
    const hasLegendTag = copy.card.tags.some((tag) => legendTags.has(tag));
    if (!hasLegendTag) {
      reasons.push({
        code: "deck.signatureTag",
        message: `Signature card "${copy.card.name}" does not match the Champion Legend tag.`,
        section: "mainDeck",
        registeredCardId: copy.registeredCardId,
        canonicalName: copy.canonicalName,
      });
    }
  }

  if (signatureCount > 3) {
    reasons.push({
      code: "deck.signatureLimit",
      message: `Deck has ${signatureCount} Signature cards. Maximum is 3.`,
    });
  }

  return signatureCount;
}

function validateCopyLimits(
  resolved: Record<DeckValidationSection, ResolvedCopy[]>,
  reasons: DeckValidationReason[],
) {
  const copiesByCanonicalName = new Map<string, number>();
  for (const copy of [
    ...resolved.chosenChampion,
    ...resolved.mainDeck,
    ...resolved.sideboard,
  ]) {
    copiesByCanonicalName.set(
      copy.canonicalName,
      (copiesByCanonicalName.get(copy.canonicalName) ?? 0) + 1,
    );
  }

  for (const [canonicalName, quantity] of copiesByCanonicalName) {
    if (quantity > 3) {
      reasons.push({
        code: "deck.copyLimit",
        message: `"${canonicalName}" has ${quantity} combined copies across Chosen Champion, Main Deck, and Sideboard. Maximum is 3.`,
        canonicalName,
      });
    }
  }
}

function validateCardDomains(
  copy: ResolvedCopy,
  allowedDomains: ReadonlySet<string>,
  section: DeckValidationSection,
  ownerLabel: string,
  reasons: DeckValidationReason[],
) {
  for (const domain of copy.card.classification.domain) {
    if (domain === "Colorless") continue;
    if (!allowedDomains.has(domain)) {
      reasons.push({
        code:
          section === "runeDeck"
            ? "deck.runeDomainIdentity"
            : "deck.domainIdentity",
        message: `"${copy.card.name}" has domain "${domain}" outside the ${ownerLabel} domain identity.`,
        section,
        registeredCardId: copy.registeredCardId,
        canonicalName: copy.canonicalName,
      });
    }
  }
}

function addTypePlacementIssue(
  copy: ResolvedCopy,
  section: DeckValidationSection,
  reasons: DeckValidationReason[],
) {
  reasons.push({
    code: "deck.typePlacement",
    message: `"${copy.card.name}" cannot be placed in ${section}.`,
    section,
    registeredCardId: copy.registeredCardId,
    canonicalName: copy.canonicalName,
  });
}

function canonicalGameplayName(card: Card): string {
  return (card.metadata.clean_name ?? card.name).replace(/\s+/g, " ").trim();
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
