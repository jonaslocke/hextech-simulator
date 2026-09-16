import type { CardCatalog } from "../catalog";
import { deriveCardCodeFromCard } from "../card-catalog/identity";
import { parseDeckList } from "./parser";
import { resolveDeckCardIdentity } from "./card-name";
import { evaluateDeckConstruction, type ConstructionEntry } from "./construction";
import type { DeckValidationSection } from "@/shared/deck-validation";
import type {
  DeckSnapshot, DeckValidationIssue, DeckValidationResult, ResolvedDeckEntry, RuntimeCardInstance,
  DeckSectionName,
} from "./types";

const sectionNames: Record<DeckSectionName, DeckValidationSection> = {
  Legend: "legend", Champion: "chosenChampion", MainDeck: "mainDeck",
  Runes: "runeDeck", Battlefields: "battlefields", Sideboard: "sideboard",
};

/** Resolve input without treating successful identity resolution as simulator validity. */
export function resolveDeckText(sourceText: string, catalog: CardCatalog): {
  entries: ConstructionEntry[];
  resolvedEntries: ResolvedDeckEntry[];
  issues: DeckValidationIssue[];
} {
  const issues: DeckValidationIssue[] = [];
  let parsed;
  try {
    parsed = parseDeckList(sourceText);
  } catch (error) {
    return {
      entries: [], resolvedEntries: [],
      issues: [{ code: "deck.parse", message: error instanceof Error ? error.message : "Unable to parse deck." }],
    };
  }

  const resolvedEntries: ResolvedDeckEntry[] = [];
  const entries = parsed.entries.map((entry): ConstructionEntry => {
    const resolution = resolveDeckCardIdentity(catalog, entry);
    const context = {
      section: sectionNames[entry.section], quantity: entry.quantity,
      sourceName: entry.name, line: entry.line,
    };
    if (!resolution.ok) {
      issues.push({ code: resolution.code, message: resolution.message, ...context });
      return context;
    }
    resolvedEntries.push({ ...entry, card: resolution.card });
    return { ...context, card: resolution.card, cardCode: deriveCardCodeFromCard(resolution.card) };
  });
  return { entries, resolvedEntries, issues };
}

/**
 * Source-only construction stage for catalog generation/publication.
 * An ok result does not establish canonical approval or runtime readiness;
 * user-facing validation and admission use deck-validation-service.
 */
export function validateDeckConstruction(
  sourceText: string,
  catalog: CardCatalog,
  options: { ownerId?: string } = {},
): DeckValidationResult {
  const resolution = resolveDeckText(sourceText, catalog);
  const evaluation = evaluateDeckConstruction(resolution.entries, { namedEntries: true, catalog });
  const issues = [...resolution.issues, ...(
    resolution.issues.some((issue) => issue.code === "deck.parse") ? [] : evaluation.reasons
  )];
  if (issues.length > 0) return { ok: false, issues };
  const bySection = (section: DeckSectionName) =>
    resolution.resolvedEntries.filter((entry) => entry.section === section);
  return {
    ok: true, issues: [],
    snapshot: createDeckSnapshot({
      sourceText, catalogVersionHash: catalog.versionHash, ownerId: options.ownerId ?? "player",
      legend: bySection("Legend")[0], champion: bySection("Champion")[0],
      mainDeck: bySection("MainDeck"), runes: bySection("Runes"),
      battlefields: bySection("Battlefields"), sideboard: bySection("Sideboard"),
    }),
  };
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
