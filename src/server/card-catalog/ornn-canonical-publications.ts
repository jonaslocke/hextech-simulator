import type { Card } from "../catalog";
import type { CanonicalCardPublicationInput } from "./canonical-card-repository";
import { hashCardRulesText } from "./import-preview";

type Assignment = [
  CanonicalCardPublicationInput["clauses"][number]["assignments"][number]["family"],
  string,
  Record<string, string | number | boolean | null>?,
];
type Clause = Assignment[];

const friendlyUnit = (selectionKey?: string): Assignment => [
  "selector",
  "selector.friendly_unit",
  {
    minimumCount: 1,
    maximumCount: 1,
    area: "board",
    locationRelation: "any",
    controller: "controller",
    excludesSource: false,
    ...(selectionKey ? { selectionKey } : {}),
  },
];

const runeClauses: Clause[] = [
  [["ability", "ability.exhaust_for_resource", { resourceType: "energy", amountSource: "constant", amount: 1, usage: "unrestricted" }]],
  [["ability", "ability.recycle_for_power", { amount: 1, domain: "sourceDomain", usage: "unrestricted" }]],
];

const models: Record<string, Clause[]> = {
  "SFD-189": [[["ability", "ability.exhaust_for_resource", { resourceType: "power", amountSource: "constant", amount: 1, domain: "rainbow", usage: "cardOrAbility:Gear" }]]],
  "SFD-058": [
    [["trigger", "trigger.on_play", { actor: "controller", subject: "source" }], ["action", "action.search_top_deck", { count: 4, cardType: "Gear", maximumSelect: 1, revealSelected: true }]],
    [["trigger", "trigger.hold", {}], ["action", "action.search_top_deck", { count: 4, cardType: "Gear", maximumSelect: 1, revealSelected: true }]],
  ],
  "OGN-043": [[["timing", "timing.action", {}], ["selector", "selector.enemy_unit", { minimumCount: 1, maximumCount: 1, area: "board", locationRelation: "any", controller: "opponent", excludesSource: false, selectionKey: "unit" }], ["selector", "selector.move_destination", { unitSelectionKey: "unit", minimumCount: 1, maximumCount: 1, selectionKey: "destination" }], ["action", "action.move_unit", { selectionKey: "unit", destinationSelectionKey: "destination" }]]],
  "OGN-044": [[["selector", "selector.source", { minimumCount: 0, maximumCount: 1, selectionKey: "additional-calm", selectionPurpose: "optionalCost" }], ["cost", "cost.pay", { amount: 1, resource: "rune", optional: true, selectionKey: "additional-calm", domain: "calm" }], ["action", "action.draw_by_optional_cost", { selectionKey: "additional-calm", paidCount: 1, unpaidCount: 0 }]]],
  "OGN-045": [[["timing", "timing.reaction", {}], ["selector", "selector.chain_item", { itemKind: "spell", controller: "opponent", maximumEnergyCost: 4, maximumPowerCost: 1, minimumCount: 1, maximumCount: 1, selectionKey: "spell" }], ["action", "action.counter_chain_item", { selectionKey: "spell" }]]],
  "OGN-060": [[["trigger", "trigger.friendly_unit_combat", { event: "attackOrDefend" }], ["condition", "condition.event_subject_combat_alone", {}], ["modifier", "modifier.modify_numeric_value", { attribute: "might", operation: "increase", operand: "constant", amount: 1, target: "event_subject", duration: "thisTurn" }]]],
  "OGN-087": [[["keyword", "keyword.tank", {}], ["trigger", "trigger.on_play", { actor: "controller", subject: "source" }], ["action", "action.draw_cards", { player: "controller", count: 1 }]]],
  "OGN-091": [[["trigger", "trigger.on_play", { actor: "controller", subject: "gear" }], ["action", "action.ready_cards", { player: "controller", target: "source" }]]],
  "SFD-042": [[friendlyUnit(), ["ability", "ability.equip", {}], ["cost", "cost.pay", { amount: 1, resource: "rune" }]]],
  "SFD-046": [
    [["trigger", "trigger.on_play", { actor: "controller", subject: "source" }], ["action", "action.draw_cards", { player: "controller", count: 1 }]],
    [["ability", "ability.activated_effect", {}], ["cost", "cost.pay", { amount: 1, resource: "energy" }], ["cost", "cost.pay", { amount: 1, resource: "rune" }], ["cost", "cost.exhaust_source", {}], ["action", "action.kill_card", { target: "source" }], ["action", "action.draw_cards", { player: "controller", count: 1 }]],
  ],
  "SFD-051": [[friendlyUnit(), ["ability", "ability.equip", {}], ["cost", "cost.pay", { amount: 1, resource: "rune" }]]],
  "SFD-056": [
    [["keyword", "keyword.quick_draw", {}], ["trigger", "trigger.on_play", { actor: "controller", subject: "source" }], friendlyUnit("unit"), ["action", "action.attach_equipment", { target: "friendly_unit", selectionKey: "unit" }]],
    [["ability", "ability.equip", {}], friendlyUnit("unit"), ["cost", "cost.pay", { amount: 1, resource: "rune" }]],
  ],
  "SFD-061": [[["trigger", "trigger.on_play", { actor: "controller", subject: "source" }], ["selector", "selector.card", { zone: "trash", cardType: "Gear", owner: "controller", minimumCount: 1, maximumCount: 1 }], ["action", "action.return_to_hand", { target: "card" }]]],
  "SFD-064": [
    [["keyword", "keyword.quick_draw", {}], ["trigger", "trigger.on_play", { actor: "controller", subject: "source" }], friendlyUnit("unit"), ["action", "action.attach_equipment", { target: "friendly_unit", selectionKey: "unit" }]],
    [["ability", "ability.equip", {}], friendlyUnit("unit"), ["cost", "cost.pay", { amount: 1, resource: "rune" }]],
  ],
  "OGN-081": [[["ability", "ability.exhaust_for_resource", { resourceType: "power", amountSource: "constant", amount: 1, domain: "calm", usage: "unrestricted" }]]],
  "UNL-053": [
    [["trigger", "trigger.on_play", { actor: "controller", subject: "source" }], ["action", "action.draw_cards", { player: "controller", count: 1 }]],
    [["trigger", "trigger.on_death", { subject: "source" }], ["action", "action.reveal_opponent_hand", {}], ["action", "action.grant_facedown_vision", {}], ["action", "action.gain_xp", { amount: 1 }]],
  ],
  "UNL-078": [
    [["keyword", "keyword.temporary", {}], ["trigger", "trigger.on_play", { actor: "controller", subject: "source" }], ["action", "action.play_token", { tokenName: "ready 3 :rb_might: Sprite unit", count: 1, placement: "base", entryState: "ready" }]],
    [["trigger", "trigger.on_death", { subject: "source" }], ["action", "action.play_token", { tokenName: "ready 3 :rb_might: Sprite unit", count: 1, placement: "base", entryState: "ready" }]],
  ],
  "VEN-045": [
    [["ability", "ability.empower", {}], ["cost", "cost.pay", { amount: 4, resource: "energy" }], ["cost", "cost.pay", { amount: 1, resource: "rune" }]],
    [["modifier", "modifier.modify_numeric_value", { attribute: "energyCost", operation: "increase", operand: "constant", amount: 1, target: "opponent_spell", duration: "whileSourceOnBoard", condition: "sourceNotEmpowered" }]],
    [["modifier", "modifier.modify_numeric_value", { attribute: "energyCost", operation: "increase", operand: "constant", amount: 1, target: "opponent_spell", duration: "whileSourceOnBoard", condition: "sourceEmpowered" }], ["modifier", "modifier.modify_numeric_value", { attribute: "powerCost", operation: "increase", operand: "constant", amount: 1, target: "opponent_spell", duration: "whileSourceOnBoard", condition: "sourceEmpowered" }]],
  ],
  "VEN-058": [[["keyword", "type.additional", { type: "Gear" }], ["trigger", "trigger.on_play", { actor: "controller", subject: "source" }], ["condition", "condition.card_type_presence", { cardType: "Gear", minimumCount: 3, excludesSource: true }], ["action", "action.draw_cards", { player: "controller", count: 1 }]]],
  "SFD-217": [[["trigger", "trigger.conquer_battlefield", {}], ["action", "action.draw_by_controlled_battlefield_count", {}]]],
  "SFD-213": [[["modifier", "modifier.modify_numeric_value", { attribute: "energyCost", operation: "reduce", operand: "constant", amount: 1, minimum: 0, target: "controller_card", cardType: "Gear", excludeTokens: true, duration: "whileSourceAtBattlefield", condition: "firstCardOfTypePlayedThisTurn" }]]],
  "SFD-221": [[["trigger", "trigger.conquer_battlefield", {}], ["selector", "selector.gear", { controller: "controller", minimumCount: 0, maximumCount: 1, selectionKey: "gear" }], ["action", "action.ready_cards", { player: "controller", target: "card", selectionKey: "gear" }], ["action", "action.optional", { effectKey: "detach", prompt: "Detach this Equipment?", onlyIfSelectedBy: "gear" }], ["action", "action.detach_equipment", { target: "equipment", selectionKey: "gear", onlyIfEquipment: true, requiresOptionKey: "detach" }]]],
  "OGN-089": runeClauses,
  "OGN-042": runeClauses,
  "VEN-040": [[["timing", "timing.reaction", {}], ["selector", "selector.friendly_unit", { minimumCount: 1, maximumCount: 1, area: "board", locationRelation: "any", controller: "controller", excludesSource: false, inCombatWithEnemyDomain: "fury", targetedByEnemySpellDomain: "fury" }], ["modifier", "modifier.modify_numeric_value", { attribute: "might", operation: "increase", operand: "constant", amount: 4, target: "friendly_unit", duration: "thisTurn" }]]],
  "VEN-061": [[["timing", "timing.reaction", {}], ["modifier", "modifier.ignore_deflect", {}], ["selector", "selector.enemy_unit", { minimumCount: 1, maximumCount: 1, area: "board", locationRelation: "any", controller: "opponent", excludesSource: false, requiredDomain: "body" }], ["modifier", "modifier.modify_numeric_value", { attribute: "might", operation: "reduce", operand: "constant", amount: 5, target: "unit", duration: "thisTurn" }]]],
  "SFD-032": [[["trigger", "trigger.on_play", { actor: "controller", subject: "source" }], ["selector", "selector.gear", { minimumCount: 0, maximumCount: 1, selectionKey: "gear" }], ["action", "action.kill_card", { selectionKey: "gear" }]]],
  "SFD-045": [[["timing", "timing.reaction", {}], ["selector", "selector.chain_item", { itemKind: "spellOrAbility", controller: "opponent", choosesControlledCardType: "UnitOrGear", minimumCount: 1, maximumCount: 1, selectionKey: "chain-item" }], ["action", "action.counter_chain_item", { selectionKey: "chain-item" }]]],
  "SFD-074": [[["trigger", "trigger.on_play", { actor: "controller", subject: "source" }], ["selector", "selector.gear", { minimumCount: 0, maximumCount: 1, maximumEnergyCost: 1, selectionKey: "gear" }], ["action", "action.kill_card", { selectionKey: "gear" }], ["action", "action.play_token", { tokenName: "Gold gear", count: 1, placement: "base", entryState: "exhausted", onlyIfPreviousEffectSucceeded: true }]]],
};

export function buildOrnnCanonicalPublication(
  card: Card,
): CanonicalCardPublicationInput {
  const cardCode = card.public_code.split("/")[0]!;
  const clauses = models[cardCode];
  if (!clauses) {
    throw new Error(`Missing Ornn canonical model: ${cardCode}`);
  }
  const effect = equipmentEffect(cardCode, card);
  return {
    cardCode,
    card,
    sourceTextHash: hashCardRulesText(card),
    modelingStatus: "approved",
    adminNotes: "PR 01 Ornn executable corpus model.",
    clauses: clauses.map((assignments, index) =>
      clause(card.text.plain, index, assignments),
    ),
    ...(effect ? { effectText: effect.text, effectClauses: effect.clauses } : {}),
  };
}

function clause(sourceText: string, index: number, assignments: Clause) {
  return {
    id: `clause-${index + 1}`,
    sourceText,
    normalizedText: sourceText,
    unsupportedReason: null,
    assignments: assignments.map(([family, primitiveId, parameters = {}]) => ({
      family,
      primitiveId,
      sourceText,
      parameters,
      confidence: "high" as const,
    })),
  };
}

function equipmentEffect(cardCode: string, card: Card) {
  const sourceImageUrl = card.media.image_url;
  if (!sourceImageUrl) {
    throw new Error(`Equipment source image is required: ${cardCode}`);
  }
  if (cardCode === "SFD-042") return {
    text: { plain: "If this was attached to me this turn, I have an additional +2 Might.", sourceImageUrl },
    clauses: [clause("If this was attached to me this turn, I have an additional +2 Might.", 0, [["modifier", "modifier.modify_numeric_value", { attribute: "might", operation: "increase", operand: "constant", amount: 2, target: "unit", duration: "whileAttached", condition: "sourceAttachedThisTurn" }]])],
  };
  if (cardCode === "SFD-051") return {
    text: { plain: "If I would die, kill this instead. Heal me, exhaust me, and recall me.", sourceImageUrl },
    clauses: [clause("If I would die, kill this instead. Heal me, exhaust me, and recall me.", 0, [["replacement", "replacement.recall_on_next_death", { target: "attachedTopMost", duration: "whileAttached", exhausted: true, consumeSource: "kill" }]])],
  };
  if (cardCode === "SFD-064") return {
    text: { plain: "[Shield] 2 (+2 Might while I'm a defender.)", sourceImageUrl },
    clauses: [clause("[Shield] 2 (+2 Might while I'm a defender.)", 0, [["keyword", "keyword.shield", { amount: 2 }], ["modifier", "modifier.modify_numeric_value", { attribute: "might", operation: "increase", operand: "constant", amount: 2, target: "unit", duration: "whileAttached", condition: "targetDefending" }]])],
  };
  return null;
}
