import { readFile } from "node:fs/promises";
import path from "node:path";
import { analyzeCardCorpus } from "../src/server/card-catalog/primitive-discovery";
import { buildCorpusBehaviorSuggestionReport } from "../src/server/card-catalog/behavior-suggestions";
import { cardSetFileSchema, type Card } from "../src/server/catalog";
import { parseDeckList } from "../src/server/deck";
import { selectPreferredPrinting } from "../src/server/card-catalog/printing-selection";

const ACCEPTED_DECKS = ["garen", "kaisa", "viktor"] as const;
const TOKEN_CARD_SUPERTYPE = "Token";

const cards = cardSetFileSchema.parse(
  JSON.parse(await readFile(path.join(process.cwd(), "data/sets/ogn.json"), "utf8")),
);
const acceptedNames = await loadAcceptedNames();
const gameplayGroups = groupByCleanName(
  cards.filter((card) => card.classification.supertype !== TOKEN_CARD_SUPERTYPE),
);
const remainingCards = [...gameplayGroups.entries()]
  .filter(([cleanName]) => !acceptedNames.has(cleanName))
  .map(([, printings]) => selectPreferredPrinting(printings));
const report = buildCorpusBehaviorSuggestionReport(
  analyzeCardCorpus(remainingCards, ["ogn.json"]),
);

if (process.argv.includes("--check")) {
  if (remainingCards.length !== 242) {
    throw new Error(`Unexpected remaining OGN gameplay definition count: ${remainingCards.length}`);
  }
  if (report.cards.length !== remainingCards.length) {
    throw new Error("Inventory report does not cover every remaining gameplay definition.");
  }
  console.log(`OGN inventory check passed: ${remainingCards.length} gameplay definitions.`);
} else {
  console.log(`# Origins remaining gameplay-distinct inventory\n`);
  console.log(`Definitions: ${remainingCards.length}`);
  console.log(`Cards with rules text: ${report.summary.cardsWithRulesText}`);
  console.log(`Clauses: ${report.cards.reduce((total, card) => total + card.clauses.length, 0)}\n`);
  for (const card of report.cards) {
    console.log(`- ${card.cardCode} | ${card.cardName} | ${familyFor(card)} | ${card.supportStatus}`);
    for (const clause of card.clauses) {
      console.log(`  - ${clause.id}: ${clause.sourceText}`);
    }
  }
}

async function loadAcceptedNames(): Promise<Set<string>> {
  const names = new Set<string>();
  for (const deckId of ACCEPTED_DECKS) {
    const source = await readFile(path.join(process.cwd(), "data/decks", `${deckId}.dec.txt`), "utf8");
    for (const entry of parseDeckList(source).entries) {
      const cleanName = entry.section === "Legend"
        ? entry.name.replace(/^[^-]+-\s*/, "")
        : entry.name;
      names.add(cleanName);
    }
  }
  return names;
}

function groupByCleanName(sourceCards: readonly Card[]) {
  const groups = new Map<string, Card[]>();
  for (const card of sourceCards) {
    const cleanName = card.metadata.clean_name ?? card.name;
    groups.set(cleanName, [...(groups.get(cleanName) ?? []), card]);
  }
  return groups;
}

function familyFor(card: { primitiveIds: string[] }): string {
  const primitiveIds = new Set(card.primitiveIds);
  if (["action.look", "action.reveal", "action.recycle_cards"].some((id) => primitiveIds.has(id))) {
    return "top-deck-inspection-and-zone-transfer";
  }
  if (["action.play_selected_unit", "selector.card"].some((id) => primitiveIds.has(id))) {
    return "effect-driven-card-play-and-placement";
  }
  if (["replacement.instead", "prevention.prevent", "trigger.on_death"].some((id) => primitiveIds.has(id))) {
    return "death-replacement-and-prevention";
  }
  if (["keyword.hidden", "modifier.facedown_capacity"].some((id) => primitiveIds.has(id))) {
    return "hidden-and-private-information";
  }
  if (["choice.choose_mode", "choice.optional"].some((id) => primitiveIds.has(id))) {
    return "choices-and-optionality";
  }
  if (["cost.pay", "cost.exhaust_source", "cost.spend_buff"].some((id) => primitiveIds.has(id))) {
    return "payment-and-additional-costs";
  }
  if (["trigger.on_play", "trigger.on_move", "trigger.on_ready", "trigger.on_damage"].some((id) => primitiveIds.has(id))) {
    return "triggers-and-chain-continuation";
  }
  if (["action.move_unit", "keyword.ganking"].some((id) => primitiveIds.has(id))) {
    return "movement-and-combat-entry";
  }
  return "damage-modifiers-and-existing-verbs";
}
