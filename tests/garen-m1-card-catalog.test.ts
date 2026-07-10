import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import {
  buildBehaviorDefinitionDocument,
  buildCanonicalCardDocument,
  buildCurrentBehaviorCatalog,
  hashCardRulesText,
  type CanonicalBehaviorModel,
  type CanonicalCardPublicationInput,
} from "../src/server/card-catalog";
import {
  cardSetFileSchema,
  type Card,
  type CardCatalog,
} from "../src/server/catalog";
import { parseDeckList, validateDeckList } from "../src/server/deck";
import { buildDeckSnapshot } from "../src/server/game";

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
type AssignmentInput = {
  family: CanonicalCardPublicationInput["clauses"][number]["assignments"][number]["family"];
  primitiveId: string;
  parameters: Record<string, string | number | boolean | null>;
  order: number;
};

const RECRUIT_TOKEN = "1 :rb_might: Recruit unit";

const EXPECTED_GAREN_MODELS: Record<string, ModelExpectation> = {
  "OGS-023": {
    clauses: [
      {
        sequence: 0,
        triggers: [["trigger.conquer", {}, 0]],
        conditions: [
          [
            "condition.unit_presence",
            {
              controller: "controller",
              locationRelation: "eventBattlefield",
              minimumCount: 4,
            },
            1,
          ],
        ],
        effects: [["action.draw_cards", { player: "controller", count: 2 }, 2]],
      },
    ],
  },
  "OGS-007": {
    clauses: [
      {
        sequence: 0,
        keywords: [
          ["keyword.assault", { amount: 2 }, 0],
          ["keyword.shield", { amount: 2 }, 1],
        ],
      },
    ],
  },
  "OGN-126": basicRuneModel(),
  "OGN-214": basicRuneModel(),
  "OGN-294": {
    clauses: [
      {
        sequence: 0,
        effects: [
          [
            "modifier.modify_numeric_value",
            {
              attribute: "might",
              operation: "increase",
              operand: "constant",
              amount: 1,
              target: "unit",
              locationRelation: "sourceLocation",
              duration: "whileSourceAtBattlefield",
            },
            0,
          ],
        ],
      },
    ],
  },
  "SFD-219": {
    clauses: [
      {
        sequence: 0,
        triggers: [["trigger.hold_battlefield", {}, 0]],
        effects: [
          [
            "action.channel_runes",
            { player: "eachPlayer", count: 1, entryState: "exhausted" },
            1,
          ],
        ],
      },
    ],
  },
  "OGN-289": {
    clauses: [
      {
        sequence: 0,
        triggers: [["trigger.conquer_battlefield", {}, 1]],
        timings: [["timing.delayed", { point: "endOfThisTurn" }, 0]],
        effects: [
          [
            "action.ready_cards",
            { player: "controller", target: "runes", count: 2 },
            2,
          ],
        ],
      },
    ],
  },
  "OGN-129": {
    playTimings: [["timing.action", {}, 0]],
    clauses: [
      {
        sequence: 0,
        effects: [
          [
            "modifier.enter_ready",
            { target: "controller_units", duration: "thisTurn" },
            1,
          ],
          ["action.draw_cards", { player: "controller", count: 1 }, 2],
        ],
      },
    ],
  },
  "OGN-210": {
    clauses: [
      { sequence: 0, keywords: [["keyword.assault", { amount: 1 }, 0]] },
    ],
  },
  "OGN-206": {
    playTimings: [["timing.reaction", {}, 0]],
    clauses: [
      {
        sequence: 0,
        selectors: [
          [
            "selector.friendly_unit",
            {
              minimumCount: 2,
              maximumCount: 2,
              area: "board",
              locationRelation: "any",
              controller: "controller",
              excludesSource: false,
            },
            1,
          ],
        ],
        effects: [
          [
            "modifier.modify_numeric_value",
            {
              attribute: "might",
              operation: "increase",
              operand: "constant",
              amount: 2,
              target: "friendly_unit",
              duration: "thisTurn",
            },
            2,
          ],
        ],
      },
    ],
  },
  "OGN-130": {
    clauses: [
      {
        sequence: 0,
        triggers: [["trigger.attack", {}, 0]],
        selectors: [
          [
            "selector.enemy_unit",
            {
              minimumCount: 1,
              maximumCount: 1,
              area: "battlefield",
              locationRelation: "sourceLocation",
              controller: "opponent",
              excludesSource: false,
            },
            1,
          ],
        ],
        effects: [["action.deal_damage", { amount: 1, target: "unit" }, 2]],
      },
    ],
  },
  "OGN-211": {
    clauses: [
      {
        sequence: 0,
        triggers: [["trigger.on_play", { actor: "controller", subject: "source" }, 0]],
        effects: [
          [
            "action.play_token",
            { tokenName: RECRUIT_TOKEN, count: 1, placement: "sourceLocation" },
            1,
          ],
        ],
      },
    ],
  },
  "OGN-132": {
    clauses: [
      {
        sequence: 0,
        triggers: [["trigger.on_play", { actor: "controller", subject: "source" }, 0]],
        selectors: [
          [
            "selector.unit",
            {
              scope: "any",
              minimumCount: 1,
              maximumCount: 1,
              area: "board",
              locationRelation: "any",
              excludesSource: true,
            },
            1,
          ],
        ],
        effects: [
          ["action.ready_cards", { player: "controller", target: "unit" }, 2],
        ],
      },
    ],
  },
  "OGN-222": {
    clauses: [
      {
        sequence: 0,
        triggers: [
          ["trigger.on_move", { subject: "source", destination: "battlefield" }, 0],
        ],
        effects: [
          [
            "action.play_token",
            { tokenName: RECRUIT_TOKEN, count: 1, placement: "sourceLocation" },
            1,
          ],
        ],
      },
    ],
  },
  "OGN-219": { clauses: [] },
  "OGS-024": {
    playTimings: [["timing.action", {}, 0]],
    clauses: [
      {
        sequence: 0,
        selectors: [
          [
            "selector.friendly_unit",
            {
              minimumCount: 0,
              maximumCount: 0,
              area: "board",
              locationRelation: "any",
              controller: "controller",
              excludesSource: false,
              automatic: true,
              selectionKey: "friendlyUnits",
            },
            1,
          ],
        ],
        effects: [
          [
            "modifier.modify_numeric_value",
            {
              attribute: "might",
              operation: "increase",
              operand: "constant",
              amount: 2,
              target: "friendly_unit",
              duration: "thisTurn",
              selectionKey: "friendlyUnits",
            },
            2,
          ],
        ],
      },
    ],
  },
  "OGN-131": {
    clauses: [
      {
        sequence: 0,
        triggers: [["trigger.attack", {}, 0]],
        conditions: [
          [
            "condition.unit_presence",
            {
              controller: "opponent",
              locationRelation: "sourceLocation",
              readyState: "ready",
              minimumCount: 1,
            },
            1,
          ],
        ],
        effects: [
          [
            "modifier.modify_numeric_value",
            {
              attribute: "might",
              operation: "increase",
              operand: "constant",
              amount: 2,
              target: "source",
              duration: "thisTurn",
            },
            2,
          ],
        ],
      },
    ],
  },
  "OGN-215": {
    clauses: [
      { sequence: 0, keywords: [["keyword.assault", { amount: 1 }, 0]] },
    ],
  },
  "OGS-013": {
    clauses: [
      {
        sequence: 0,
        effects: [
          [
            "modifier.modify_numeric_value",
            {
              attribute: "might",
              operation: "increase",
              operand: "constant",
              amount: 1,
              target: "friendly_unit",
              locationRelation: "sourceLocation",
              excludesSource: true,
              duration: "whileSourceOnBoard",
            },
            0,
          ],
        ],
      },
    ],
  },
  "OGS-015": {
    playTimings: [["timing.action", {}, 0]],
    clauses: [
      {
        sequence: 0,
        effects: [
          [
            "action.play_token",
            {
              tokenName: RECRUIT_TOKEN,
              count: 4,
              placement: "chooseBaseOrControlledBattlefield",
            },
            1,
          ],
        ],
      },
    ],
  },
  "OGS-016": {
    clauses: [
      {
        sequence: 0,
        effects: [["modifier.enter_ready", { target: "source" }, 0]],
      },
    ],
  },
};

test("Garen M1 deck has exact publishable executable behavior models", async () => {
  const deckPath = path.join(process.cwd(), "data", "decks", "garen.dec.txt");
  const [catalog, deckText, behaviorCatalog] = await Promise.all([
    loadLocalSetCatalog(),
    readFile(deckPath, "utf8"),
    buildCurrentBehaviorCatalog(),
  ]);
  const validation = validateDeckList(deckText, catalog, { ownerId: "garen" });
  assert.equal(validation.ok, true, JSON.stringify(validation.issues, null, 2));
  if (!validation.ok) return;

  const cards = [
    ...new Map(
      validation.snapshot.instances.map((instance) => [
        cardCode(instance.card),
        instance.card,
      ]),
    ).values(),
  ];
  assert.equal(cards.length, 21);
  assert.deepEqual(
    new Set(cards.map(cardCode)),
    new Set(Object.keys(EXPECTED_GAREN_MODELS)),
  );

  const documents = cards.map((card) => {
    const document = buildCanonicalCardDocument(
      publicationInput(card, EXPECTED_GAREN_MODELS[cardCode(card)]!),
      behaviorCatalog,
      "created",
      "updated",
    );

    assert.equal(document.modelingStatus, "approved");
    assert.equal(document.runtimeSupportStatus, "supported");
    assert.deepEqual(
      summarizeModel(document.behaviorModel),
      EXPECTED_GAREN_MODELS[document.cardCode],
    );
    return document;
  });

  const snapshot = buildDeckSnapshot(
    deckText,
    documents,
    behaviorCatalog.map((entry) =>
      buildBehaviorDefinitionDocument(entry, "updated"),
    ),
  );
  const parsedDeck = parseDeckList(deckText);
  assert.equal(snapshot.cards.length, 21);
  assert.equal(snapshot.entries.length, parsedDeck.entries.length);
});

async function loadLocalSetCatalog(): Promise<CardCatalog> {
  const setDirectory = path.join(process.cwd(), "data", "sets");
  const setFiles = (await readdir(setDirectory))
    .filter((filename) => filename.endsWith(".json"))
    .sort();
  const cards = (
    await Promise.all(
      setFiles.map(async (filename) =>
        cardSetFileSchema.parse(
          JSON.parse(
            await readFile(path.join(setDirectory, filename), "utf8"),
          ),
        ),
      ),
    )
  ).flat();
  const byName = new Map<string, Card>();
  const byPublicCode = new Map<string, Card>();
  const hash = createHash("sha256");

  hash.update(JSON.stringify(cards));
  for (const card of cards) {
    const current = byName.get(card.name);
    if (
      !current ||
      (current.metadata.alternate_art && !card.metadata.alternate_art)
    ) {
      byName.set(card.name, card);
    }
    byPublicCode.set(card.public_code, card);
  }

  return {
    cards,
    byName,
    byPublicCode,
    setFiles,
    versionHash: hash.digest("hex"),
  };
}

function publicationInput(
  card: Card,
  model: ModelExpectation,
): CanonicalCardPublicationInput {
  const rulesText = card.text.plain;
  const clauses = model.clauses.map((clause, index) => ({
    id: `clause-${index}`,
    sourceText: rulesText,
    normalizedText: rulesText,
    unsupportedReason: null,
    assignments: assignmentsForClause(
      {
        ...clause,
        timings: [...(index === 0 ? model.playTimings ?? [] : []), ...(clause.timings ?? [])],
      },
      rulesText,
    ),
  }));

  return {
    cardCode: cardCode(card),
    card,
    sourceTextHash: hashCardRulesText(card),
    modelingStatus: "approved",
    adminNotes: "Garen M1 behavior certification",
    clauses,
  };
}

function assignmentsForClause(
  clause: ClauseExpectation,
  sourceText: string,
) {
  const entries: AssignmentInput[] = [
    ...toAssignments("ability", clause.abilities),
    ...toAssignments("trigger", clause.triggers),
    ...toAssignments("condition", clause.conditions),
    ...toAssignments("selector", clause.selectors),
    ...toAssignments("timing", clause.timings),
    ...toAssignments("action", clause.effects?.filter(([id]) => id.startsWith("action."))),
    ...toAssignments("modifier", clause.effects?.filter(([id]) => id.startsWith("modifier."))),
    ...toAssignments("keyword", clause.keywords),
  ];

  return entries
    .sort((left, right) => left.order - right.order)
    .map(({ family, primitiveId, parameters }) => ({
      family,
      primitiveId,
      sourceText,
      parameters,
      confidence: "high" as const,
    }));
}

function toAssignments(
  family: AssignmentInput["family"],
  bindings: BindingExpectation[] | undefined,
): AssignmentInput[] {
  return (bindings ?? []).map(([primitiveId, parameters, order]) => ({
    family,
    primitiveId,
    parameters: parameters as Record<string, string | number | boolean | null>,
    order,
  }));
}

function summarizeModel(model: CanonicalBehaviorModel): ModelExpectation {
  const summarize = (
    bindings: CanonicalBehaviorModel["playTimings"],
  ): BindingExpectation[] =>
    bindings.map((binding) => [
      binding.behaviorId,
      binding.parameters,
      binding.order,
    ]);
  return {
    ...(model.playTimings.length
      ? { playTimings: summarize(model.playTimings) }
      : {}),
    clauses: model.clauses.map((clause) => ({
      sequence: clause.sequence,
      ...(clause.abilities.length
        ? { abilities: summarize(clause.abilities) }
        : {}),
      ...(clause.triggers.length
        ? { triggers: summarize(clause.triggers) }
        : {}),
      ...(clause.conditions.length
        ? { conditions: summarize(clause.conditions) }
        : {}),
      ...(clause.selectors.length
        ? { selectors: summarize(clause.selectors) }
        : {}),
      ...(clause.timings.length ? { timings: summarize(clause.timings) } : {}),
      ...(clause.effects.length ? { effects: summarize(clause.effects) } : {}),
      ...(clause.keywords.length
        ? { keywords: summarize(clause.keywords) }
        : {}),
    })),
  };
}

function basicRuneModel(): ModelExpectation {
  return {
    clauses: [
      {
        sequence: 0,
        abilities: [
          [
            "ability.exhaust_for_resource",
            {
              resourceType: "energy",
              amountSource: "constant",
              amount: 1,
              usage: "unrestricted",
            },
            0,
          ],
        ],
      },
      {
        sequence: 1,
        abilities: [
          [
            "ability.recycle_for_power",
            { amount: 1, domain: "sourceDomain", usage: "unrestricted" },
            0,
          ],
        ],
      },
    ],
  };
}

function cardCode(card: Card) {
  return card.public_code.split("/")[0]!;
}
