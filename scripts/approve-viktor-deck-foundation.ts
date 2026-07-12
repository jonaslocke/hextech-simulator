import { readFile } from "node:fs/promises";
import path from "node:path";
import { getMongoClient, getMongoDatabaseName } from "../src/server/db";
import {
  applyOfficialErrata,
  buildCurrentBehaviorCatalog,
  hashCardRulesText,
  loadOfficialErrata,
  publishCanonicalCard,
  type CanonicalCardPublicationInput,
} from "../src/server/card-catalog";
import { deriveCardCodeFromCard } from "../src/server/card-catalog/identity";
import { selectPreferredPrinting } from "../src/server/card-catalog/printing-selection";
import { cardSetFileSchema, type Card } from "../src/server/catalog";

const RECRUIT_TOKEN = "1 :rb_might: Recruit unit";
const RECRUIT_TOKEN_CARD_CODE = "OGN-272";
const SPRITE_TOKEN = "ready 3 :rb_might: Sprite unit";
const SPRITE_TOKEN_CARD_CODE = "OGN-274";

if (!process.argv.includes("--confirm")) {
  throw new Error("Refusing to approve Viktor foundation cards without --confirm.");
}

type Assignment = {
  family: CanonicalCardPublicationInput["clauses"][number]["assignments"][number]["family"];
  primitiveId: string;
  parameters: Record<string, string | number | boolean | null>;
};

type ClauseModel = { id: string; assignments: Assignment[] };

const MODELS: Record<string, Assignment[]> = {
  "OGN-207": [
    { family: "timing", primitiveId: "timing.reaction", parameters: {} },
    { family: "selector", primitiveId: "selector.unit", parameters: { scope: "any", area: "board", locationRelation: "any", minimumCount: 1, maximumCount: 1, selectionKey: "targetUnit" } },
    { family: "selector", primitiveId: "selector.friendly_unit", parameters: { area: "board", locationRelation: "any", minimumCount: 0, maximumCount: 1, buffedOnly: true, selectionKey: "spentBuff", selectionPurpose: "optionalCost" } },
    { family: "cost", primitiveId: "cost.spend_buff", parameters: { selectionKey: "spentBuff", optional: true, ignoreBaseCost: true } },
    { family: "modifier", primitiveId: "modifier.modify_numeric_value", parameters: { attribute: "might", operation: "increase", operand: "constant", amount: 3, target: "unit", selectionKey: "targetUnit", duration: "thisTurn" } },
  ],
  "OGN-209": [
    { family: "selector", primitiveId: "selector.friendly_unit", parameters: { area: "board", locationRelation: "any", minimumCount: 1, maximumCount: 1, deferred: true, selectionKey: "controllerUnit", selectionPlayer: "controller" } },
    { family: "selector", primitiveId: "selector.enemy_unit", parameters: { area: "board", locationRelation: "any", minimumCount: 1, maximumCount: 1, deferred: true, selectionKey: "opponentUnit", selectionPlayer: "opponent" } },
    { family: "action", primitiveId: "action.kill_unit", parameters: { target: "unit" } },
  ],
  "OGN-221": [],
  "OGN-226": [
    { family: "trigger", primitiveId: "trigger.on_play", parameters: { actor: "controller", subject: "source" } },
    { family: "selector", primitiveId: "selector.card", parameters: { zone: "trash", cardType: "Unit", owner: "controller", minimumCount: 0, maximumCount: 1, maximumEnergy: 3, maximumPower: 1, deferred: true, selectionKey: "unitToPlay" } },
    { family: "action", primitiveId: "action.play_selected_unit", parameters: { sourceSelectionKey: "unitToPlay", selectionKey: "destination" } },
  ],
  "OGN-083": [
    { family: "keyword", primitiveId: "keyword.hidden", parameters: {} },
    { family: "timing", primitiveId: "timing.reaction", parameters: {} },
    { family: "action", primitiveId: "action.draw_cards", parameters: { player: "controller", count: 2 } },
  ],
  "OGN-092": [
    { family: "trigger", primitiveId: "trigger.on_play", parameters: { actor: "controller", subject: "source" } },
    { family: "selector", primitiveId: "selector.enemy_unit", parameters: { area: "battlefield", locationRelation: "any", minimumCount: 1, maximumCount: 1 } },
    { family: "action", primitiveId: "action.deal_damage", parameters: { amount: 6, target: "unit" } },
  ],
  "OGN-106": [
    { family: "trigger", primitiveId: "trigger.on_play", parameters: { actor: "controller", subject: "source" } },
    { family: "action", primitiveId: "action.play_token", parameters: { tokenCardCode: SPRITE_TOKEN_CARD_CODE, tokenName: SPRITE_TOKEN, count: 1, placement: "sourceLocation", entryState: "ready" } },
  ],
  "OGN-217": [
    { family: "keyword", primitiveId: "keyword.legion", parameters: {} },
    { family: "trigger", primitiveId: "trigger.on_play", parameters: { actor: "controller", subject: "source" } },
    { family: "action", primitiveId: "action.buff_unit", parameters: { target: "source" } },
  ],
  "OGN-218": [
    { family: "keyword", primitiveId: "keyword.legion", parameters: {} },
    { family: "trigger", primitiveId: "trigger.on_play", parameters: { actor: "controller", subject: "source" } },
    { family: "action", primitiveId: "action.play_token", parameters: { tokenCardCode: RECRUIT_TOKEN_CARD_CODE, tokenName: RECRUIT_TOKEN, count: 2, placement: "sourceLocation" } },
  ],
  "OGN-220": [
    { family: "keyword", primitiveId: "keyword.hidden", parameters: {} },
    { family: "timing", primitiveId: "timing.action", parameters: {} },
    { family: "selector", primitiveId: "selector.friendly_unit", parameters: { area: "battlefield", locationRelation: "any", minimumCount: 1, maximumCount: 1, selectionKey: "friendlyTarget" } },
    { family: "selector", primitiveId: "selector.enemy_unit", parameters: { area: "battlefield", locationRelation: "selectedTargetLocation", minimumCount: 1, maximumCount: 1, selectionKey: "enemyTarget", referenceSelectionKey: "friendlyTarget" } },
    { family: "action", primitiveId: "action.stun_card", parameters: { target: "unit" } },
  ],
  "OGN-213": [
    { family: "keyword", primitiveId: "keyword.hidden", parameters: {} },
    { family: "timing", primitiveId: "timing.action", parameters: {} },
    { family: "selector", primitiveId: "selector.unit", parameters: { scope: "any", area: "battlefield", locationRelation: "any", minimumCount: 1, maximumCount: 1, selectionKey: "targetUnit" } },
    { family: "action", primitiveId: "action.kill_unit", parameters: { target: "unit", selectionKey: "targetUnit" } },
    { family: "action", primitiveId: "action.draw_cards", parameters: { player: "selectedCardOwner", count: 2, selectionKey: "targetUnit" } },
  ],
  "OGN-229": [
    { family: "selector", primitiveId: "selector.unit", parameters: { scope: "any", area: "board", locationRelation: "any", minimumCount: 1, maximumCount: 1 } },
    { family: "action", primitiveId: "action.kill_unit", parameters: { target: "unit" } },
  ],
  "OGN-224": [
    { family: "timing", primitiveId: "timing.action", parameters: {} },
    { family: "selector", primitiveId: "selector.gear", parameters: { minimumCount: 0, maximumCount: 1, selectionKey: "targetGear" } },
    { family: "action", primitiveId: "action.kill_permanent", parameters: { selectionKey: "targetGear" } },
    { family: "action", primitiveId: "action.draw_cards", parameters: { player: "controller", count: 1 } },
  ],
  "OGN-233": [
    { family: "timing", primitiveId: "timing.action", parameters: {} },
    { family: "selector", primitiveId: "selector.friendly_unit", parameters: { area: "board", locationRelation: "any", controller: "controller", minimumCount: 0, maximumCount: 0, automatic: true, selectionKey: "friendlyUnits" } },
    { family: "modifier", primitiveId: "modifier.modify_numeric_value", parameters: { attribute: "might", operation: "increase", operand: "constant", amount: 5, target: "friendly_unit", duration: "thisTurn", selectionKey: "friendlyUnits" } },
  ],
  "OGN-239": [
    { family: "trigger", primitiveId: "trigger.on_death", parameters: { subject: "source" } },
    { family: "action", primitiveId: "action.play_token", parameters: { tokenCardCode: RECRUIT_TOKEN_CARD_CODE, tokenName: RECRUIT_TOKEN, count: 3, placement: "base" } },
  ],
  "OGN-241": [
    { family: "timing", primitiveId: "timing.reaction", parameters: {} },
    { family: "keyword", primitiveId: "keyword.shield", parameters: { amount: 2 } },
    { family: "keyword", primitiveId: "keyword.tank", parameters: {} },
  ],
  "OGN-245": [
    { family: "ability", primitiveId: "ability.exhaust_for_resource", parameters: { resourceType: "power", amountSource: "constant", amount: 1, domain: "order", usage: "unrestricted" } },
    { family: "timing", primitiveId: "timing.reaction", parameters: {} },
  ],
  "OGN-246": [
    { family: "trigger", primitiveId: "trigger.on_death", parameters: { subject: "another_friendly_unit" } },
    { family: "condition", primitiveId: "condition.non_token", parameters: {} },
    { family: "action", primitiveId: "action.play_token", parameters: { tokenCardCode: RECRUIT_TOKEN_CARD_CODE, tokenName: RECRUIT_TOKEN, count: 1, placement: "base" } },
  ],
  "OGN-265": [
    { family: "cost", primitiveId: "cost.pay", parameters: { amount: 1, resource: "energy" } },
    { family: "cost", primitiveId: "cost.exhaust_source", parameters: {} },
    { family: "ability", primitiveId: "ability.play_token", parameters: { tokenCardCode: RECRUIT_TOKEN_CARD_CODE, tokenName: RECRUIT_TOKEN, count: 1, placement: "base" } },
  ],
  "OGN-284": [
    { family: "trigger", primitiveId: "trigger.first_beginning", parameters: {} },
    { family: "action", primitiveId: "action.channel_runes", parameters: { player: "currentTurnPlayer", count: 1 } },
  ],
  "OGN-295": [
    { family: "modifier", primitiveId: "modifier.cannot_move_from_source_battlefield", parameters: { destination: "base" } },
  ],
};

const MULTI_CLAUSE_MODELS: Record<string, ClauseModel[]> = {
  "OGN-221": [
    {
      id: "activate-decree",
      assignments: [
        { family: "timing", primitiveId: "timing.action", parameters: {} },
        { family: "modifier", primitiveId: "modifier.enable_source_triggers", parameters: { duration: "thisTurn" } },
      ],
    },
    {
      id: "kill-damaged-unit",
      assignments: [
        { family: "trigger", primitiveId: "trigger.on_damage", parameters: { subject: "any_unit" } },
        { family: "action", primitiveId: "action.kill_unit", parameters: { target: "event_subject" } },
      ],
    },
  ],
};

const client = await getMongoClient();
try {
  const cards = await loadEffectiveCards();
  const behaviorCatalog = await buildCurrentBehaviorCatalog();
  const db = client.db(getMongoDatabaseName());

  for (const [cardCode, assignments] of Object.entries(MODELS)) {
    const overlay = cards.get(cardCode);
    if (!overlay) throw new Error(`Missing local card data: ${cardCode}`);
    const card = overlay.effectiveCard;
    const document = await publishCanonicalCard(
      db,
      {
        adminNotes: "OGN Viktor deck: shared primitive foundation batch.",
        card,
        printedCard: overlay.printedCard,
        printedSourceTextHash: hashCardRulesText(overlay.printedCard),
        appliedErrata: overlay.appliedErrata,
        cardCode,
        modelingStatus: "approved",
        sourceTextHash: hashCardRulesText(card),
        clauses: (MULTI_CLAUSE_MODELS[cardCode] ?? [{ id: "clause-1", assignments }]).map((model) => ({
          id: model.id,
          sourceText: card.text.plain,
          normalizedText: card.text.plain,
          unsupportedReason: null,
          assignments: model.assignments.map((assignment) => ({
            ...assignment,
            confidence: "high" as const,
            sourceText: card.text.plain,
          })),
        })),
      },
      new Date().toISOString(),
      behaviorCatalog,
    );
    console.log(`Approved ${document.cardCode} ${document.card.name}`);
  }
} finally {
  await client.close();
}

async function loadEffectiveCards() {
  const setNames = ["ogn", "ogs", "sfd", "unl"];
  const printedSets = await Promise.all(
    setNames.map(async (setName) =>
      cardSetFileSchema.parse(JSON.parse(await readFile(
        path.join(process.cwd(), "data", "sets", `${setName}.json`),
        "utf8",
      ))),
    ),
  );
  const releases = await loadOfficialErrata(printedSets.flat());
  const ognCards = printedSets[0]!;
  const printingsByName = new Map<string, Card[]>();
  for (const card of ognCards) {
    const printings = printingsByName.get(card.name) ?? [];
    printings.push(card);
    printingsByName.set(card.name, printings);
  }

  return new Map(
    [...printingsByName.values()].map((printings) => {
      const printedCard = selectPreferredPrinting(printings);
      return [deriveCardCodeFromCard(printedCard), applyOfficialErrata(printedCard, releases)];
    }),
  );
}
