import type { Card, CardCatalog } from "@/server/catalog";
import { resolveLegendChampionTag } from "./card-name";
import type {
  DeckValidationConstraints, DeckValidationReason, DeckValidationResponse,
  DeckValidationSection,
} from "@/shared/deck-validation";

const CONSTRAINTS: DeckValidationConstraints = {
  legend: { exact: 1 },
  chosenChampion: { exact: 1 },
  mainDeck: { minimum: 40, maximum: null, includesChosenChampion: true },
  runeDeck: { exact: 12 },
  battlefields: { exact: 3, unique: true },
  sideboard: { maximum: 10 },
};
const COPY_MAXIMUM = 3;
const SIGNATURE_MAXIMUM = 3;
const MAIN_DECK_TYPES = new Set(["Gear", "Spell", "Unit"]);

export type ConstructionEntry = {
  section: DeckValidationSection;
  quantity: number;
  card?: Card;
  cardCode?: string;
  sourceName?: string;
  line?: number;
  registeredCardId?: string;
};

export function getDeckValidationConstraints(): DeckValidationConstraints {
  return structuredClone(CONSTRAINTS);
}

/** One construction evaluator for source quantities and resolved registered copies. */
export function evaluateDeckConstruction(
  entries: readonly ConstructionEntry[],
  options: { namedEntries?: boolean; catalog?: Pick<CardCatalog, "cards" | "byName"> } = {},
): {
  reasons: DeckValidationReason[];
  summary: DeckValidationResponse["summary"];
  constraints: DeckValidationConstraints;
} {
  const reasons: DeckValidationReason[] = [];
  const counts: Record<DeckValidationSection, number> = {
    legend: 0, chosenChampion: 0, mainDeck: 0, runeDeck: 0, battlefields: 0, sideboard: 0,
  };
  for (const entry of entries) counts[entry.section] += entry.quantity;
  const activeCardCount = counts.mainDeck + counts.chosenChampion;
  for (const [section, code, label] of [
    ["legend", "deck.legendCount", "Champion Legend"],
    ["chosenChampion", "deck.championCount", "Chosen Champion Unit"],
    ["runeDeck", "deck.runeCount", "Rune cards"],
    ["battlefields", "deck.battlefieldCount", "Battlefields"],
  ] as const) {
    const exact = CONSTRAINTS[section].exact;
    if (counts[section] !== exact) {
      reasons.push({ code, section, message: `Deck must contain exactly ${exact} ${label}.` });
    }
  }
  if (activeCardCount < CONSTRAINTS.mainDeck.minimum) {
    reasons.push({
      code: "deck.mainDeckSize", section: "mainDeck",
      message: `Main Deck must contain at least ${CONSTRAINTS.mainDeck.minimum} cards including the Chosen Champion.`,
    });
  }
  if (counts.sideboard > CONSTRAINTS.sideboard.maximum) {
    reasons.push({
      code: "deck.sideboardSize", section: "sideboard",
      message: `Sideboard can contain at most ${CONSTRAINTS.sideboard.maximum} cards.`,
    });
  }

  if (options.namedEntries) validateNamedEntries(entries, reasons);
  const resolved = entries.filter((entry): entry is ConstructionEntry & { card: Card } => !!entry.card);
  for (const entry of resolved) {
    if (!isPermittedType(entry.card, entry.section)) {
      reasons.push(reasonForEntry(entry, {
        code: "deck.typePlacement",
        message: `"${entry.sourceName ?? entry.card.name}" cannot be placed in ${entry.section}.`,
      }));
    }
  }

  const battlefields = resolved.filter((entry) => entry.section === "battlefields");
  if (battlefields.some((entry) => entry.quantity > 1) ||
      new Set(battlefields.map((entry) => canonicalGameplayName(entry.card))).size !== battlefields.length) {
    reasons.push({
      code: "deck.battlefieldUnique", section: "battlefields",
      message: "Battlefields must have distinct gameplay names.",
    });
  }

  const legend = resolved.find((entry) => entry.section === "legend")?.card;
  const champion = resolved.find((entry) => entry.section === "chosenChampion");
  if (legend && champion && !hasMatchingChampionTag(legend, champion.card, options.catalog)) {
    reasons.push(reasonForEntry(champion, {
      code: "deck.championTag",
      message: `Chosen Champion "${champion.card.name}" does not match the Champion Legend tag.`,
    }));
  }
  if (legend) {
    const domains = new Set(legend.classification.domain);
    for (const entry of resolved) {
      for (const domain of entry.card.classification.domain) {
        if (domain !== "Colorless" && !domains.has(domain)) {
          reasons.push(reasonForEntry(entry, {
            code: entry.section === "runeDeck" ? "deck.runeDomainIdentity" : "deck.domainIdentity",
            message: `"${entry.card.name}" has domain "${domain}" outside the Legend domain identity.`,
          }));
        }
      }
    }
  }

  let signatureCount = 0;
  const copiesByName = new Map<string, number>();
  for (const entry of resolved) {
    if (!["chosenChampion", "mainDeck", "sideboard"].includes(entry.section)) continue;
    const name = canonicalGameplayName(entry.card);
    copiesByName.set(name, (copiesByName.get(name) ?? 0) + entry.quantity);
    if (entry.card.classification.supertype !== "Signature" && entry.card.metadata.signature !== true) continue;
    signatureCount += entry.quantity;
    if (legend && !hasMatchingChampionTag(legend, entry.card, options.catalog)) {
      reasons.push(reasonForEntry(entry, {
        code: "deck.signatureTag",
        message: `Signature card "${entry.card.name}" does not match the Champion Legend tag.`,
      }));
    }
  }
  if (signatureCount > SIGNATURE_MAXIMUM) {
    reasons.push({
      code: "deck.signatureLimit",
      message: `Deck has ${signatureCount} Signature cards. Maximum is ${SIGNATURE_MAXIMUM}.`,
    });
  }
  for (const [canonicalName, count] of copiesByName) {
    if (count > COPY_MAXIMUM) reasons.push({
      code: "deck.copyLimit", canonicalName,
      message: `"${canonicalName}" has ${count} combined copies across Chosen Champion, Main Deck, and Sideboard. Maximum is ${COPY_MAXIMUM}.`,
    });
  }

  return {
    reasons,
    constraints: getDeckValidationConstraints(),
    summary: {
      activeCardCount, mainDeckCount: counts.mainDeck, sideboardCount: counts.sideboard, signatureCount,
      legendCount: counts.legend, chosenChampionCount: counts.chosenChampion,
      runeDeckCount: counts.runeDeck, battlefieldCount: counts.battlefields,
    },
  };
}

/** Selection affordance uses the same type, tag, and domain predicates as construction. */
export function isEligibleChosenChampion(
  card: Card, legend: Card, catalog?: Pick<CardCatalog, "cards" | "byName">,
): boolean {
  return isPermittedType(card, "chosenChampion") &&
    hasMatchingChampionTag(legend, card, catalog) &&
    card.classification.domain.every((domain) =>
      domain === "Colorless" || legend.classification.domain.includes(domain));
}

export function canonicalGameplayName(card: Card): string {
  return (card.metadata.clean_name ?? card.name).replace(/\s+/g, " ").trim();
}

export function reasonForEntry(
  entry: ConstructionEntry,
  reason: Pick<DeckValidationReason, "code" | "message">,
): DeckValidationReason {
  return {
    ...reason, section: entry.section, line: entry.line, sourceName: entry.sourceName,
    registeredCardId: entry.registeredCardId, cardCode: entry.cardCode,
    canonicalName: entry.card ? canonicalGameplayName(entry.card) : undefined,
  };
}

/** Attach catalog/runtime evidence to every affected submitted section. */
export function contextualizeReadinessReasons(
  entries: readonly ConstructionEntry[], reasons: readonly DeckValidationReason[],
): DeckValidationReason[] {
  return reasons.flatMap((reason) => {
    const matches = entries.filter((entry) =>
      reason.cardCode ? entry.cardCode === reason.cardCode :
        reason.canonicalName && entry.card && canonicalGameplayName(entry.card) === reason.canonicalName);
    if (matches.length === 0) return [reason];
    return matches.map((entry) => ({ ...reasonForEntry(entry, reason), ...reason, section: entry.section }));
  });
}

function hasMatchingChampionTag(
  legend: Card, card: Card, catalog?: Pick<CardCatalog, "cards" | "byName">,
): boolean {
  const championTag = resolveLegendChampionTag(legend, catalog);
  return championTag !== undefined && card.tags.includes(championTag);
}

function isPermittedType(card: Card, section: DeckValidationSection): boolean {
  switch (section) {
    case "legend": return card.classification.type === "Legend";
    case "chosenChampion":
      return card.classification.type === "Unit" && card.classification.supertype === "Champion";
    case "runeDeck": return card.classification.type === "Rune";
    case "battlefields": return card.classification.type === "Battlefield";
    default: return MAIN_DECK_TYPES.has(card.classification.type);
  }
}

function validateNamedEntries(entries: readonly ConstructionEntry[], reasons: DeckValidationReason[]) {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (entry.section !== "mainDeck" && entry.section !== "sideboard") continue;
    if (entry.section === "mainDeck" && (entry.quantity < 1 || entry.quantity > COPY_MAXIMUM)) {
      reasons.push(reasonForEntry(entry, {
        code: "deck.mainDeckEntryCopies",
        message: `MainDeck entry "${entry.sourceName}" must have 1-${COPY_MAXIMUM} copies.`,
      }));
    }
    const identity = `${entry.section}:${entry.card ? canonicalGameplayName(entry.card) : entry.sourceName}`;
    if (seen.has(identity)) {
      reasons.push(reasonForEntry(entry, {
        code: "deck.duplicateEntry", message: `Duplicate card "${entry.sourceName}" in ${entry.section}.`,
      }));
    }
    seen.add(identity);
  }
}
