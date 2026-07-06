import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import {
  analyzeCardBehaviorSuggestions,
  buildCanonicalCardDocument,
  buildCurrentBehaviorCatalog,
  canonicalCardPublicationInputSchema,
  hashCardRulesText,
  type CanonicalBehaviorModel,
  type CanonicalCardPublicationInput
} from "../src/server/card-catalog";
import { loadCardCatalog, type Card } from "../src/server/catalog";
import { validateDeckList } from "../src/server/deck";

type BindingExpectation = [string, Record<string, unknown>, number];
type ClauseExpectation = {
  sequence: number;
  abilities?: BindingExpectation[];
  triggers?: BindingExpectation[];
  conditions?: BindingExpectation[];
  selectors?: BindingExpectation[];
  timings?: BindingExpectation[];
  effects?: BindingExpectation[];
  keywords?: BindingExpectation[];
};
type ModelExpectation = {
  playTimings?: BindingExpectation[];
  clauses: ClauseExpectation[];
};

const EXPECTED_MODELS: Record<string, ModelExpectation> = {
  "OGS-021": { clauses: [{ sequence: 0, triggers: [["trigger.on_play", { actor: "controller", subject: "spell" }, 0]], conditions: [["condition.compare_numeric_value", { valueSource: "eventSubject.printedEnergyCost", operator: "greaterThanOrEqual", comparisonValue: 5 }, 2]], effects: [["action.draw_cards", { player: "controller", count: 1 }, 1]] }] },
  "OGS-014": { clauses: [{ sequence: 0, abilities: [["ability.exhaust_for_resource", { resourceType: "energy", amountSource: "constant", amount: 2, usage: "spellsOnly" }, 0]] }] },
  "OGN-095": { playTimings: [["timing.reaction", {}, 0]], clauses: [{ sequence: 0, selectors: [["selector.unit", unitSelector("any", 1, 1, "board"), 1]], effects: [["modifier.modify_numeric_value", { attribute: "might", operation: "reduce", operand: "constant", amount: 1, target: "unit", duration: "thisTurn", minimum: 1 }, 2]] }, { sequence: 1, effects: [["action.draw_cards", { player: "controller", count: 1 }, 0]] }] },
  "OGN-210": { clauses: [{ sequence: 0, keywords: [["keyword.assault", { amount: 1 }, 0]] }] },
  "OGN-103": { clauses: [{ sequence: 0, triggers: [["trigger.on_play", { actor: "controller", subject: "spell" }, 0]], effects: [["modifier.modify_numeric_value", { attribute: "might", operation: "increase", operand: "constant", amount: 1, target: "source", duration: "thisTurn" }, 1]] }] },
  "OGN-206": { playTimings: [["timing.reaction", {}, 0]], clauses: [{ sequence: 0, selectors: [["selector.friendly_unit", { minimumCount: 2, maximumCount: 2, area: "board", locationRelation: "any", controller: "controller", excludesSource: false }, 1]], effects: [["modifier.modify_numeric_value", { attribute: "might", operation: "increase", operand: "constant", amount: 2, target: "friendly_unit", duration: "thisTurn" }, 2]] }] },
  "OGN-084": { clauses: [{ sequence: 0, effects: [["modifier.modify_numeric_value", { attribute: "energyCost", operation: "reduce", operand: "constant", amount: 1, target: "controller_spell", duration: "whileSourceAtBattlefield", minimum: 1 }, 0]] }] },
  "OGN-087": { clauses: [{ sequence: 0, triggers: [["trigger.on_play", { actor: "controller", subject: "source" }, 0]], effects: [["action.draw_cards", { player: "controller", count: 1 }, 1]], keywords: [["keyword.tank", {}, 2]] }] },
  "OGN-219": { clauses: [] },
  "OGN-085": actionUnitModel("battlefield", "action.deal_damage", { amount: 6, target: "unit" }),
  "OGS-012": actionUnitModel("battlefield", "action.kill_unit", { target: "unit" }),
  "OGS-006": { clauses: [{ sequence: 0, triggers: [["trigger.on_play", { actor: "controller", subject: "spell" }, 0]], conditions: [["condition.compare_numeric_value", { valueSource: "eventSubject.printedEnergyCost", operator: "greaterThanOrEqual", comparisonValue: 5 }, 2]], effects: [["modifier.modify_numeric_value", { attribute: "might", operation: "increase", operand: "constant", amount: 3, target: "source", duration: "thisTurn" }, 1]] }] },
  "OGN-105": { clauses: [{ sequence: 0, selectors: [["selector.unit", unitSelector("any", 0, 2, "board"), 0]], effects: [["action.deal_damage", { amount: 6, target: "unit" }, 1]] }] },
  "OGS-016": { clauses: [{ sequence: 0, effects: [["modifier.enter_ready", { target: "source" }, 0]] }] },
  "OGN-088": { clauses: [] },
  "OGS-022": actionUnitModel("board", "action.deal_damage", { amount: 8, target: "unit" }),
  "OGN-089": basicRuneModel(),
  "OGN-214": basicRuneModel(),
  "OGN-276": { clauses: [{ sequence: 0, effects: [["modifier.modify_numeric_value", { attribute: "victoryRequirement", operation: "increase", operand: "constant", amount: 1, target: "game", duration: "whileSourceOnBoard" }, 0]] }] },
  "SFD-219": { clauses: [{ sequence: 0, triggers: [["trigger.hold_battlefield", {}, 0]], effects: [["action.channel_runes", { player: "eachPlayer", count: 1, entryState: "exhausted" }, 1]] }] },
  "OGN-289": { clauses: [{ sequence: 0, triggers: [["trigger.conquer_battlefield", {}, 1]], timings: [["timing.delayed", { point: "endOfThisTurn" }, 0]], effects: [["action.ready_cards", { player: "controller", target: "runes", count: 2 }, 2]] }] }
};

test("Lux MVP deck has exact, publishable behavior models for all 21 cards", async () => {
  const { cards, report, behaviorCatalog } = await loadLuxBehaviorReport();

  assert.equal(cards.length, 21);
  assert.equal(report.cards.length, 21);
  assert.equal(report.summary.completeSuggestionCount, 21);
  assert.equal(report.summary.unsupportedCardCount, 0);
  assert.equal(report.summary.ambiguousCardCount, 0);
  assert.equal(report.summary.missingRequiredParameterCount, 0);
  assert.deepEqual(new Set(report.cards.map((card) => card.cardCode)), new Set(Object.keys(EXPECTED_MODELS)));

  const documents = report.cards.map((suggestion) => {
    const card = cards.find((candidate) => candidate.public_code.startsWith(`${suggestion.cardCode}/`));
    assert.ok(card, `Missing resolved card ${suggestion.cardCode}`);
    const document = buildCanonicalCardDocument(
      publicationInput(card, suggestion), behaviorCatalog, "created", "updated"
    );
    assert.equal(document.modelingStatus, "approved");
    assert.deepEqual(summarizeModel(document.behaviorModel), EXPECTED_MODELS[document.cardCode]);
    return document;
  });

  assert.equal(documents.length, 21);
  assert.ok(documents.every((card) => card.runtimeSupportStatus === "supported"));
  for (const cardCode of ["OGN-219", "OGN-088"]) {
    const vanilla = documents.find((card) => card.cardCode === cardCode);
    assert.deepEqual(vanilla?.behaviorModel, { playTimings: [], clauses: [] });
  }
});

test("Lux publication rejects malformed scope, condition, target, parameters, and ordering", async () => {
  const { cards, report, behaviorCatalog } = await loadLuxBehaviorReport();
  const byCode = new Map(report.cards.map((card) => [card.cardCode, card]));
  const inputFor = (cardCode: string) => {
    const card = cards.find((candidate) => candidate.public_code.startsWith(`${cardCode}/`));
    const suggestion = byCode.get(cardCode);
    assert.ok(card && suggestion);
    return publicationInput(card, suggestion);
  };

  const scope = inputFor("OGN-206");
  scope.clauses[0]!.assignments.find((item) => item.family === "selector")!.parameters.controller = "opponent";
  assert.throws(() => buildCanonicalCardDocument(scope, behaviorCatalog, "a", "b"), /Invalid behavior binding/);

  const condition = inputFor("OGS-006");
  condition.clauses[0]!.assignments.find((item) => item.family === "condition")!.parameters.valueSource = "printedEnergyCost";
  assert.throws(() => buildCanonicalCardDocument(condition, behaviorCatalog, "a", "b"), /Invalid behavior binding/);

  const target = inputFor("OGN-105");
  target.clauses[0]!.assignments.find((item) => item.primitiveId === "action.deal_damage")!.parameters.target = "player";
  assert.throws(() => buildCanonicalCardDocument(target, behaviorCatalog, "a", "b"), /Invalid behavior binding/);

  const parameters = inputFor("OGN-084");
  parameters.clauses[0]!.assignments[0]!.parameters.amount = -1;
  assert.throws(() => buildCanonicalCardDocument(parameters, behaviorCatalog, "a", "b"), /Invalid behavior binding/);

  const duplicateClause = inputFor("OGN-095");
  duplicateClause.clauses[1]!.id = duplicateClause.clauses[0]!.id;
  assert.throws(() => buildCanonicalCardDocument(duplicateClause, behaviorCatalog, "a", "b"), /Duplicate behavior clause id/);

  const clientOrdered = structuredClone(inputFor("OGS-022")) as CanonicalCardPublicationInput & {
    order?: number;
  };
  clientOrdered.order = 4;
  assert.throws(() => canonicalCardPublicationInputSchema.parse(clientOrdered), /Unrecognized key/);
});

async function loadLuxBehaviorReport() {
  const deckPath = path.join(process.cwd(), "data", "decks", "lux.dec.txt");
  const [catalog, deckText, behaviorCatalog] = await Promise.all([
    loadCardCatalog(), readFile(deckPath, "utf8"), buildCurrentBehaviorCatalog()
  ]);
  const validation = validateDeckList(deckText, catalog, { ownerId: "lux-mvp" });
  if (!validation.ok) assert.fail(JSON.stringify(validation.issues));
  const cards = [...new Map(validation.snapshot.instances.map((instance) => [instance.card.public_code, instance.card])).values()];
  const report = analyzeCardBehaviorSuggestions(cards, [deckPath], behaviorCatalog);
  return { cards, report, behaviorCatalog };
}

function publicationInput(card: Card, suggestion: Awaited<ReturnType<typeof loadLuxBehaviorReport>>["report"]["cards"][number]): CanonicalCardPublicationInput {
  return {
    cardCode: suggestion.cardCode,
    card,
    sourceTextHash: hashCardRulesText(card),
    modelingStatus: "approved",
    adminNotes: "Lux MVP acceptance test.",
    clauses: suggestion.clauses.map((clause) => ({
      id: clause.id,
      sourceText: clause.sourceText,
      normalizedText: clause.normalizedText,
      unsupportedReason: clause.unsupportedReason,
      assignments: clause.assignments.map(({ assignment }) => assignment)
    }))
  };
}

function summarizeModel(model: CanonicalBehaviorModel): ModelExpectation {
  const summarize = (bindings: CanonicalBehaviorModel["playTimings"]): BindingExpectation[] =>
    bindings.map((binding) => [binding.behaviorId, binding.parameters, binding.order]);
  return {
    ...(model.playTimings.length ? { playTimings: summarize(model.playTimings) } : {}),
    clauses: model.clauses.map((clause) => ({
      sequence: clause.sequence,
      ...(clause.abilities.length ? { abilities: summarize(clause.abilities) } : {}),
      ...(clause.triggers.length ? { triggers: summarize(clause.triggers) } : {}),
      ...(clause.conditions.length ? { conditions: summarize(clause.conditions) } : {}),
      ...(clause.selectors.length ? { selectors: summarize(clause.selectors) } : {}),
      ...(clause.timings.length ? { timings: summarize(clause.timings) } : {}),
      ...(clause.effects.length ? { effects: summarize(clause.effects) } : {}),
      ...(clause.keywords.length ? { keywords: summarize(clause.keywords) } : {})
    }))
  };
}

function unitSelector(scope: string, minimumCount: number, maximumCount: number, area: string) {
  return { scope, minimumCount, maximumCount, area, locationRelation: "any", excludesSource: false };
}

function actionUnitModel(area: string, behaviorId: string, parameters: Record<string, unknown>): ModelExpectation {
  return { playTimings: [["timing.action", {}, 0]], clauses: [{ sequence: 0, selectors: [["selector.unit", unitSelector("any", 1, 1, area), 1]], effects: [[behaviorId, parameters, 2]] }] };
}

function basicRuneModel(): ModelExpectation {
  return { clauses: [
    { sequence: 0, abilities: [["ability.exhaust_for_resource", { resourceType: "energy", amountSource: "constant", amount: 1, usage: "unrestricted" }, 0]] },
    { sequence: 1, abilities: [["ability.recycle_for_power", { amount: 1, domain: "sourceDomain", usage: "unrestricted" }, 0]] }
  ] };
}
