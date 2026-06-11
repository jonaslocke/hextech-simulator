import type { Card, CardCatalog } from "../catalog";
import { parseDeckList } from "./parser";
import type {
  DeckEntry,
  DeckSnapshot,
  DeckValidationIssue,
  DeckValidationResult,
  ResolvedDeckEntry,
  RuntimeCardInstance
} from "./types";

const mainDeckTypes = new Set(["Gear", "Spell", "Unit"]);
const championPoolSections = new Set(["Champion", "MainDeck", "Sideboard"]);

type ValidateOptions = {
  ownerId?: string;
};

export function validateDeckList(
  sourceText: string,
  catalog: CardCatalog,
  options: ValidateOptions = {}
): DeckValidationResult {
  const issues: DeckValidationIssue[] = [];
  const ownerId = options.ownerId ?? "player";
  let parsed;

  try {
    parsed = parseDeckList(sourceText);
  } catch (error) {
    return {
      ok: false,
      issues: [
        {
          code: "deck.parse",
          message: error instanceof Error ? error.message : "Unable to parse deck."
        }
      ]
    };
  }

  const resolved = parsed.entries.map((entry) => ({
    ...entry,
    card: catalog.byName.get(entry.name)
  }));

  for (const entry of resolved) {
    if (!entry.card) {
      issues.push({
        code: "deck.unknownCard",
        message: `Unknown card "${entry.name}".`,
        line: entry.line
      });
    }
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const entries = resolved as ResolvedDeckEntry[];
  const bySection = {
    Legend: entries.filter((entry) => entry.section === "Legend"),
    Champion: entries.filter((entry) => entry.section === "Champion"),
    Runes: entries.filter((entry) => entry.section === "Runes"),
    Battlefields: entries.filter((entry) => entry.section === "Battlefields"),
    MainDeck: entries.filter((entry) => entry.section === "MainDeck"),
    Sideboard: entries.filter((entry) => entry.section === "Sideboard")
  };

  const legendTotal = sumQuantities(bySection.Legend);
  const championTotal = sumQuantities(bySection.Champion);
  const mainDeckTotal = sumQuantities(bySection.MainDeck);
  const runeTotal = sumQuantities(bySection.Runes);
  const battlefieldTotal = sumQuantities(bySection.Battlefields);

  if (legendTotal !== 1 || bySection.Legend.length !== 1) {
    issues.push({
      code: "deck.legendCount",
      message: "Deck must contain exactly one Champion Legend."
    });
  }

  if (championTotal !== 1 || bySection.Champion.length !== 1) {
    issues.push({
      code: "deck.championCount",
      message: "Deck must contain exactly one Chosen Champion Unit."
    });
  }

  if (mainDeckTotal + championTotal < 40) {
    issues.push({
      code: "deck.mainDeckSize",
      message: "Main Deck must contain at least 40 cards counting the chosen champion."
    });
  }

  if (runeTotal !== 12) {
    issues.push({
      code: "deck.runeCount",
      message: "Rune deck must contain exactly 12 rune cards."
    });
  }

  if (battlefieldTotal !== 3 || new Set(bySection.Battlefields.map((entry) => entry.name)).size !== 3) {
    issues.push({
      code: "deck.battlefieldCount",
      message: "Deck must contain exactly 3 unique Battlefields."
    });
  }

  validateMainDeckEntryCounts(bySection.MainDeck, issues);
  validateDuplicateEntries(bySection.MainDeck, "MainDeck", issues);
  validateDuplicateEntries(bySection.Sideboard, "Sideboard", issues);
  validateCopyLimits(entries, issues);
  validateTypePlacement(entries, issues);

  const legend = bySection.Legend[0];
  const champion = bySection.Champion[0];

  if (legend && champion) {
    validateChampionCompatibility(legend, champion, issues);
    validateDomainIdentity(entries, legend.card, issues);
    validateSignatureCards(entries, legend.card, issues);
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    issues: [],
    snapshot: createDeckSnapshot({
      sourceText,
      catalogVersionHash: catalog.versionHash,
      ownerId,
      legend: bySection.Legend[0],
      champion: bySection.Champion[0],
      mainDeck: bySection.MainDeck,
      runes: bySection.Runes,
      battlefields: bySection.Battlefields,
      sideboard: bySection.Sideboard
    })
  };
}

function sumQuantities(entries: DeckEntry[]): number {
  return entries.reduce((total, entry) => total + entry.quantity, 0);
}

function validateMainDeckEntryCounts(
  mainDeck: ResolvedDeckEntry[],
  issues: DeckValidationIssue[]
) {
  for (const entry of mainDeck) {
    if (entry.quantity < 1 || entry.quantity > 3) {
      issues.push({
        code: "deck.mainDeckEntryCopies",
        message: `MainDeck entry "${entry.name}" must have 1-3 copies.`,
        line: entry.line
      });
    }
  }
}

function validateDuplicateEntries(
  entries: ResolvedDeckEntry[],
  section: "MainDeck" | "Sideboard",
  issues: DeckValidationIssue[]
) {
  const seen = new Set<string>();

  for (const entry of entries) {
    if (seen.has(entry.name)) {
      issues.push({
        code: "deck.duplicateEntry",
        message: `Duplicate card "${entry.name}" in ${section}.`,
        line: entry.line
      });
    }

    seen.add(entry.name);
  }
}

function validateCopyLimits(
  entries: ResolvedDeckEntry[],
  issues: DeckValidationIssue[]
) {
  const copiesByName = new Map<string, number>();

  for (const entry of entries) {
    if (!championPoolSections.has(entry.section)) {
      continue;
    }

    copiesByName.set(entry.name, (copiesByName.get(entry.name) ?? 0) + entry.quantity);
  }

  for (const [name, quantity] of copiesByName) {
    if (quantity > 3) {
      issues.push({
        code: "deck.copyLimit",
        message: `"${name}" has ${quantity} combined copies across Champion, MainDeck, and Sideboard. Maximum is 3.`
      });
    }
  }
}

function validateTypePlacement(
  entries: ResolvedDeckEntry[],
  issues: DeckValidationIssue[]
) {
  for (const entry of entries) {
    const type = entry.card.classification.type;
    const supertype = entry.card.classification.supertype;
    const valid =
      (entry.section === "Legend" && type === "Legend") ||
      (entry.section === "Champion" && type === "Unit" && supertype === "Champion") ||
      (entry.section === "Runes" && type === "Rune") ||
      (entry.section === "Battlefields" && type === "Battlefield") ||
      (entry.section === "MainDeck" && mainDeckTypes.has(type)) ||
      (entry.section === "Sideboard" && mainDeckTypes.has(type));

    if (!valid) {
      issues.push({
        code: "deck.typePlacement",
        message: `"${entry.name}" cannot be placed in ${entry.section}.`,
        line: entry.line
      });
    }
  }
}

function validateChampionCompatibility(
  legend: ResolvedDeckEntry,
  champion: ResolvedDeckEntry,
  issues: DeckValidationIssue[]
) {
  const legendTags = new Set(legend.card.tags);
  const hasMatchingTag = champion.card.tags.some((tag) => legendTags.has(tag));

  if (!hasMatchingTag) {
    issues.push({
      code: "deck.championTag",
      message: `Chosen Champion "${champion.name}" does not match Champion Legend "${legend.name}".`,
      line: champion.line
    });
  }
}

function validateDomainIdentity(
  entries: ResolvedDeckEntry[],
  legend: Card,
  issues: DeckValidationIssue[]
) {
  const identity = new Set(legend.classification.domain);

  for (const entry of entries) {
    for (const domain of entry.card.classification.domain) {
      if (domain === "Colorless") {
        continue;
      }

      if (!identity.has(domain)) {
        issues.push({
          code: "deck.domainIdentity",
          message: `"${entry.name}" has domain "${domain}" outside the Legend domain identity.`,
          line: entry.line
        });
      }
    }
  }
}

function validateSignatureCards(
  entries: ResolvedDeckEntry[],
  legend: Card,
  issues: DeckValidationIssue[]
) {
  const legendTags = new Set(legend.tags);
  let signatureCount = 0;

  for (const entry of entries) {
    const isSignature =
      entry.card.classification.supertype === "Signature" ||
      entry.card.metadata.signature === true;

    if (!isSignature) {
      continue;
    }

    const hasLegendTag = entry.card.tags.some((tag) => legendTags.has(tag));

    if (!hasLegendTag) {
      issues.push({
        code: "deck.signatureTag",
        message: `Signature card "${entry.name}" does not match the Champion Legend tag.`,
        line: entry.line
      });
    }

    signatureCount += entry.quantity;
  }

  if (signatureCount > 3) {
    issues.push({
      code: "deck.signatureLimit",
      message: `Deck has ${signatureCount} Signature cards. Maximum is 3.`
    });
  }
}

function createDeckSnapshot(input: {
  sourceText: string;
  catalogVersionHash: string;
  ownerId: string;
  legend: ResolvedDeckEntry;
  champion: ResolvedDeckEntry;
  mainDeck: ResolvedDeckEntry[];
  runes: ResolvedDeckEntry[];
  battlefields: ResolvedDeckEntry[];
  sideboard: ResolvedDeckEntry[];
}): DeckSnapshot {
  const instances: RuntimeCardInstance[] = [];

  addInstances(instances, input.ownerId, "legend", input.legend);
  addInstances(instances, input.ownerId, "champion", input.champion);
  addInstances(instances, input.ownerId, "mainDeck", ...input.mainDeck);
  addInstances(instances, input.ownerId, "runeDeck", ...input.runes);
  addInstances(instances, input.ownerId, "battlefield", ...input.battlefields);
  addInstances(instances, input.ownerId, "sideboard", ...input.sideboard);

  return {
    sourceText: input.sourceText,
    catalogVersionHash: input.catalogVersionHash,
    legend: input.legend,
    champion: input.champion,
    mainDeck: input.mainDeck,
    runes: input.runes,
    battlefields: input.battlefields,
    sideboard: input.sideboard,
    instances
  };
}

function addInstances(
  instances: RuntimeCardInstance[],
  ownerId: string,
  source: RuntimeCardInstance["source"],
  ...entries: ResolvedDeckEntry[]
) {
  for (const entry of entries) {
    for (let copy = 1; copy <= entry.quantity; copy += 1) {
      instances.push({
        instanceId: `${ownerId}:${source}:${entry.name}:${copy}`,
        ownerId,
        source,
        card: entry.card
      });
    }
  }
}
