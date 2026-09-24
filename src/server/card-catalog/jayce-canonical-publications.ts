import type { Card } from "../catalog";
import type { CanonicalCardPublicationInput } from "./canonical-card-repository";
import { hashCardRulesText } from "./import-preview";

type Assignment = [
  CanonicalCardPublicationInput["clauses"][number]["assignments"][number]["family"],
  string,
  Record<string, string | number | boolean | null>?,
];

type Clause = Assignment[];

const models: Record<string, Clause[]> = {
  "OGN-160": [[
    ["trigger", "trigger.end_of_turn", { player: "controller" }],
    ["action", "action.reveal_until_card_type_and_play", { cardType: "Unit", ignoreBaseCosts: true }],
  ]],
  "OGN-115": [[
    ["action", "action.each_player_choose_top_deck_card_and_play", { count: 5 }],
  ]],
  "VEN-149": [
    [
      ["ability", "ability.empower", {}],
      ["cost", "cost.pay", { amount: 2, resource: "energy" }],
      ["cost", "cost.pay", { amount: 2, resource: "rune", domain: "rainbow" }],
    ],
    [
      ["ability", "ability.activated_effect", {}],
      ["selector", "selector.gear", {
        controller: "controller",
        minimumCount: 1,
        maximumCount: 1,
        selectionKey: "gears",
      }],
      ["cost", "cost.pay", { amount: 1, resource: "energy" }],
      ["cost", "cost.exhaust_source", {}],
      ["action", "action.ready_cards", { player: "controller", target: "card", selectionKey: "gears", count: 1 }],
    ],
    [
      ["condition", "condition.source_empowered", {}],
      ["ability", "ability.activated_effect", {}],
      ["selector", "selector.gear", {
        controller: "controller",
        minimumCount: 2,
        maximumCount: 2,
        selectionKey: "gears",
      }],
      ["cost", "cost.pay", { amount: 1, resource: "energy" }],
      ["cost", "cost.exhaust_source", {}],
      ["action", "action.ready_cards", { player: "controller", target: "card", selectionKey: "gears", count: 2 }],
    ],
  ],
  "VEN-068": [
    [
      ["trigger", "trigger.on_play", { actor: "controller", subject: "source" }],
      ["action", "action.ready_cards", {
        player: "controller",
        target: "card",
        selectExhaustedCards: true,
        excludesSource: true,
        minimumCount: 0,
        maximumCount: 1,
        prompt: "You may ready an exhausted card other than Jayce",
      }],
    ],
    [
      ["trigger", "trigger.on_play", { actor: "controller", subject: "gear" }],
      ["condition", "condition.first_non_token_gear_play_this_turn", {}],
      ["action", "action.ready_cards", {
        player: "controller",
        target: "card",
        selectExhaustedCards: true,
        excludesSource: true,
        minimumCount: 0,
        maximumCount: 1,
        prompt: "You may ready an exhausted card other than Jayce",
      }],
    ],
  ],
  "OGN-138": [[
    ["action", "action.channel_or_draw", {
      channelCount: 2,
      entryState: "exhausted",
      fallbackDrawCount: 1,
      fallbackWhenFewerThan: 2,
    }],
  ]],
  "OGN-133": [[
    ["timing", "timing.reaction"],
    ["selector", "selector.unit", {
      scope: "each",
      area: "battlefield",
      locationRelation: "any",
      selectionKey: "units",
    }],
    ["action", "action.deal_damage", {
      amount: 1,
      target: "unit",
      selectionKey: "units",
    }],
  ]],
  "OGN-099": [[
    ["ability", "ability.activated_effect", {}],
    ["selector", "selector.card", {
      zone: "trash",
      cardType: "any",
      owner: "controller",
      minimumCount: 3,
      maximumCount: 3,
      selectionKey: "recycledCards",
    }],
    ["cost", "cost.recycle_selected_cards", {
      count: 3,
      selectionKey: "recycledCards",
    }],
    ["cost", "cost.pay", { amount: 1, resource: "energy" }],
    ["cost", "cost.exhaust_source", {}],
    ["action", "action.draw_cards", { player: "controller", count: 1 }],
  ]],
  "UNL-069": [[
    ["action", "action.play_token", {
      tokenName: "ready 3 :rb_might: Sprite unit",
      count: 2,
      placement: "base",
      entryState: "ready",
    }],
  ]],
  "VEN-075": [
    [["modifier", "modifier.enter_exhausted", { target: "source" }]],
    [
      ["ability", "ability.empower", {}],
      ["cost", "cost.pay", { amount: 1, resource: "energy" }],
      ["cost", "cost.exhaust_source", {}],
    ],
    [
      ["timing", "timing.reaction"],
      ["ability", "ability.exhaust_for_resource", {
        resourceType: "energy",
        amountSource: "constant",
        amount: 1,
        empoweredAmount: 2,
        usage: "unrestricted",
      }],
    ],
  ],
  "UNL-103": [[
    ["timing", "timing.reaction"],
    ["action", "action.optional", {
      effectKey: "recycle",
      prompt: "Choose an effect",
      yesLabel: "Recycle up to 3 cards from opponents' trashes",
      noLabel: "Draw 1",
    }],
    ["action", "action.recycle_cards", {
      target: "card",
      selectFromZone: "trash",
      owner: "opponent",
      cardType: "any",
      minimumCount: 0,
      maximumCount: 3,
      prompt: "Choose up to 3 cards to recycle",
      onlyIfEffectKey: "recycle",
      onlyIfEffectValue: true,
    }],
    ["action", "action.draw_cards", {
      player: "controller",
      count: 1,
      onlyIfEffectKey: "recycle",
      onlyIfEffectValue: false,
    }],
  ]],
  "VEN-085": [[
    ["timing", "timing.reaction"],
    ["action", "action.reveal_opponent_hand", {}],
    ["action", "action.recycle_cards", {
      target: "card",
      selectFromZone: "hand",
      owner: "opponent",
      cardType: "any",
      requiredDomain: "mind",
      minimumCount: 1,
      maximumCount: 1,
      prompt: "Choose a Mind card from an opponent's hand to recycle",
    }],
  ]],
  "UNL-106": [[
    ["timing", "timing.reaction"],
    ["selector", "selector.friendly_unit", {
      area: "battlefield",
      locationRelation: "any",
      minimumCount: 1,
      maximumCount: 1,
      selectionKey: "protectedUnit",
    }],
    ["selector", "selector.chain_item", {
      itemKind: "spellOrAbility",
      controller: "opponent",
      choosesControlledCardType: "UnitOrGear",
      onlyTargetSelectedBy: "protectedUnit",
      minimumCount: 1,
      maximumCount: 1,
      selectionKey: "chainItem",
    }],
    ["action", "action.counter_chain_item", { selectionKey: "chainItem" }],
  ]],
  "OGN-156": [[
    ["action", "action.reveal_opponent_hand", {}],
    ["action", "action.recycle_cards", {
      target: "card",
      selectFromZone: "hand",
      owner: "opponent",
      cardType: "any",
      excludesCardType: "Unit",
      minimumCount: 1,
      maximumCount: 1,
      prompt: "Choose a non-unit card from an opponent's hand to recycle",
    }],
  ]],
  "VEN-049": [[
    ["keyword", "keyword.flow", { energyCost: 2 }],
    ["action", "action.draw_cards", { player: "controller", count: 1 }],
  ]],
  "SFD-080": [[
    ["timing", "timing.action"],
    ["keyword", "keyword.repeat", { energyCost: 1, powerCost: 1 }],
    ["selector", "selector.unit", {
      area: "board",
      locationRelation: "any",
      minimumCount: 0,
      maximumCount: 3,
      selectionKey: "units",
    }],
    ["action", "action.deal_damage", {
      amount: 1,
      target: "unit",
      selectionKey: "units",
      selectedMustShareLocation: true,
    }],
  ]],
  "SFD-077": [[
    ["keyword", "keyword.repeat", { energyCost: 4, powerCost: 1 }],
    ["action", "action.optional", {
      effectKey: "dealDamage",
      prompt: "Choose one",
      yesLabel: "Deal 4 to a unit in a base",
      noLabel: "Kill a gear",
      selectionKey: "mode",
      commitAtPlay: true,
    }],
    ["selector", "selector.unit", {
      area: "base",
      locationRelation: "any",
      minimumCount: 1,
      maximumCount: 1,
      selectionKey: "target",
      onlyIfSelectionKey: "mode",
      onlyIfSelectionValue: "yes",
    }],
    ["selector", "selector.gear", {
      minimumCount: 1,
      maximumCount: 1,
      selectionKey: "target",
      onlyIfSelectionKey: "mode",
      onlyIfSelectionValue: "no",
    }],
    ["action", "action.deal_damage", {
      amount: 4,
      target: "unit",
      selectionKey: "target",
      onlyIfEffectKey: "dealDamage",
      onlyIfEffectValue: true,
    }],
    ["action", "action.kill_card", {
      selectionKey: "target",
      onlyIfEffectKey: "dealDamage",
      onlyIfEffectValue: false,
    }],
  ]],
  "UNL-088": [
    [
      ["trigger", "trigger.beginning_phase", {}],
      ["condition", "condition.controller_hand_and_battlefield_unit_counts", {
        handCount: 4,
        battlefieldUnitCount: 4,
      }],
      ["action", "action.win_game", {}],
    ],
    [
      ["ability", "ability.activated_effect", {}],
      ["selector", "selector.card", {
        zone: "hand",
        owner: "controller",
        cardType: "any",
        minimumCount: 1,
        maximumCount: 1,
        selectionKey: "discard",
      }],
      ["cost", "cost.discard_selected_cards", { count: 1, selectionKey: "discard" }],
      ["cost", "cost.exhaust_source", {}],
      ["action", "action.play_token", {
        tokenName: "1 Might Bird unit with Deflect",
        count: 1,
        placement: "base",
        entryState: "exhausted",
      }],
    ],
  ],
  "UNL-073": [
    [
      ["selector", "selector.enemy_unit", {
        area: "board",
        locationRelation: "any",
        minimumCount: 1,
        maximumCount: 1,
        selectionKey: "target",
      }],
      ["action", "action.play_token_on_next_death", {
        selectionKey: "target",
        tokenName: "Gold gear",
      }],
      ["action", "action.deal_damage", {
        amount: 3,
        target: "unit",
        selectionKey: "target",
      }],
    ],
    [
      ["trigger", "trigger.stored_target_death", {}],
      ["action", "action.play_token", {
        tokenName: "Gold gear",
        count: 1,
        placement: "base",
        entryState: "exhausted",
      }],
    ],
  ],
  "UNL-118": [
    [["keyword", "keyword.lethal_damage", {}]],
    [
      ["trigger", "trigger.on_play", { actor: "controller", subject: "source" }],
      ["selector", "selector.enemy_unit", {
        area: "board",
        locationRelation: "any",
        minimumCount: 0,
        maximumCount: 99,
        selectionKey: "units",
      }],
      ["action", "action.deal_damage", {
        amount: 1,
        target: "unit",
        selectionKey: "units",
        atMostOnePerLocation: true,
      }],
    ],
  ],
  "SFD-209": [[
    ["modifier", "modifier.prevent_scoring_until_turn", { turn: 3 }],
  ]],
  "VEN-056": [[
    ["timing", "timing.reaction"],
    ["selector", "selector.card", {
      zone: "mainDeck",
      owner: "controller",
      cardType: "any",
      topCount: 5,
      minimumCount: 0,
      maximumCount: 5,
      selectionKey: "predictedCards",
    }],
    ["action", "action.recycle_cards", {
      target: "card",
      selectionKey: "predictedCards",
      count: 5,
    }],
    ["action", "action.draw_cards", { player: "controller", count: 2 }],
  ]],
  "OGN-287": [[
    ["trigger", "trigger.conquer_battlefield", {}],
    ["selector", "selector.card", {
      zone: "base",
      cardType: "Rune",
      owner: "controller",
      minimumCount: 1,
      maximumCount: 1,
      selectionKey: "rune",
    }],
    ["action", "action.recycle_cards", {
      target: "rune",
      selectionKey: "rune",
      count: 1,
    }],
  ]],
};

/** Approved executable models for cards required by the Jayce deck. */
export function buildJayceCanonicalPublication(
  card: Card,
): CanonicalCardPublicationInput {
  const cardCode = card.public_code.split("/")[0]!;
  const clauses = models[cardCode];
  if (!clauses) {
    throw new Error(`Missing Jayce canonical model: ${cardCode}`);
  }

  return {
    cardCode,
    card,
    sourceTextHash: hashCardRulesText(card),
    modelingStatus: "approved",
    adminNotes: "Jayce deck executable corpus model.",
    clauses: clauses.map((assignments, index) => ({
      id: `clause-${index + 1}`,
      sourceText: card.text.plain,
      normalizedText: card.text.plain,
      unsupportedReason: null,
      assignments: assignments.map(([family, primitiveId, parameters = {}]) => ({
        family,
        primitiveId,
        sourceText: card.text.plain,
        parameters,
        confidence: "high" as const,
      })),
    })),
  };
}
