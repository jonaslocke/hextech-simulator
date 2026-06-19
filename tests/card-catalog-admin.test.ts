import assert from "node:assert/strict";
import { test } from "node:test";
import {
  analyzeBehaviorTemplates,
  approveBehaviorTemplateDraft,
  assignBehaviorToCard,
  createCardImport,
  createInMemoryCardCatalogAdminRepositories,
  deriveCardCode,
  deriveCardCodeFromCard,
  readBundledSet,
  updateBehaviorTemplateDraft
} from "../src/server/card-catalog-admin";
import { cardSetFileSchema, type Card } from "../src/server/catalog";

test("derives gameplay identity from the first seven public_code characters", async () => {
  assert.equal(deriveCardCode("OGN-095/298"), "OGN-095");
  assert.equal(deriveCardCode("OGN-027a/298"), "OGN-027");
  assert.equal(deriveCardCode("OGN-307*/298"), "OGN-307");

  const cards = await readAllBundledCards();
  const baseCards = cards.filter(
    (card) =>
      card.metadata.alternate_art === false &&
      card.metadata.overnumbered === false &&
      card.metadata.signature === false
  );
  const cardCodes = baseCards.map((card) => deriveCardCodeFromCard(card));

  assert.equal(new Set(cardCodes).size, baseCards.length);
});

test("collector_number is optional and not authoritative for import validation", () => {
  const parsed = cardSetFileSchema.parse([
    {
      id: "card-1",
      name: "Test Card",
      public_code: "TST-001/001",
      attributes: {
        energy: 1,
        might: null,
        power: null
      },
      classification: {
        type: "Spell",
        supertype: null,
        rarity: "Common",
        domain: ["Mind"]
      },
      text: {
        plain: "Draw 1."
      },
      set: {
        set_id: "TST",
        label: "Test"
      },
      media: {},
      tags: [],
      orientation: "horizontal",
      metadata: {
        clean_name: "Test Card",
        alternate_art: false,
        overnumbered: false,
        signature: false
      }
    }
  ]);

  assert.equal(parsed[0]?.public_code, "TST-001/001");
});

test("behavior analysis scans the full bundled corpus and suggests reusable templates", async () => {
  const repositories = createInMemoryCardCatalogAdminRepositories();
  const cards = await readAllBundledCards();
  const result = await analyzeBehaviorTemplates(repositories, {
    cards,
    uploadedFileName: "all.json",
    importRunId: "import:all",
    now: new Date("2026-06-19T00:00:00.000Z")
  });

  const actionableDrafts = result.drafts.filter(
    (draft) => draft.suggestedBehavior?.effects.some((effect) => effect.type !== "manualReview")
  );
  const matchedCardCodes = new Set(
    actionableDrafts.flatMap((draft) => draft.matchedCardCodes)
  );

  assert.equal(result.importRun.totalCardsRead, 656);
  assert.equal(result.drafts.some((draft) => draft.name === "Action keyword"), true);
  assert.equal(result.drafts.some((draft) => draft.name === "Reaction keyword"), true);
  assert.equal(result.drafts.some((draft) => draft.name === "Draw"), true);
  assert.equal(matchedCardCodes.has("OGN-095"), true);
  assert.equal(matchedCardCodes.size > 50, true);
});

test("approved behavior templates dedupe by structural hash across future analyses", async () => {
  const repositories = createInMemoryCardCatalogAdminRepositories();
  const ogs = await readBundledSet("ogs");
  const ogn = await readBundledSet("ogn");
  const first = await analyzeBehaviorTemplates(repositories, {
    cards: ogs,
    uploadedFileName: "ogs.json",
    importRunId: "import:ogs",
    now: new Date("2026-06-19T00:00:00.000Z")
  });
  const actionDraft = first.drafts.find((draft) => draft.name === "Action keyword");

  assert.ok(actionDraft);

  const approved = await approveBehaviorTemplateDraft(repositories, {
    draftId: actionDraft.id,
    approvedBy: "tester",
    now: new Date("2026-06-19T00:01:00.000Z")
  });
  const second = await analyzeBehaviorTemplates(repositories, {
    cards: ogn,
    uploadedFileName: "ogn.json",
    importRunId: "import:ogn",
    now: new Date("2026-06-19T00:02:00.000Z")
  });
  const repeatedActionDraft = second.drafts.find(
    (draft) => draft.name === "Action keyword"
  );

  assert.ok(repeatedActionDraft);
  assert.deepEqual(repeatedActionDraft.similarApprovedTemplateIds, [
    approved.template.id
  ]);

  const duplicateApproval = await approveBehaviorTemplateDraft(repositories, {
    draftId: repeatedActionDraft.id,
    approvedBy: "tester",
    now: new Date("2026-06-19T00:03:00.000Z")
  });

  assert.equal(duplicateApproval.deduplicated, true);
  assert.equal(duplicateApproval.template.id, approved.template.id);
});

test("manual-review behavior drafts cannot be approved until unresolved clauses are fixed", async () => {
  const repositories = createInMemoryCardCatalogAdminRepositories();
  const cards = [
    createTestCard({
      name: "Mystery Spell",
      publicCode: "TST-001/001",
      text: "Choose a hidden option nobody understands."
    })
  ];
  const result = await analyzeBehaviorTemplates(repositories, {
    cards,
    uploadedFileName: "test.json",
    importRunId: "import:manual-review",
    now: new Date("2026-06-19T00:00:00.000Z")
  });
  const draft = result.drafts.find((candidate) => candidate.unresolvedClauses.length);

  assert.ok(draft);
  await assert.rejects(
    () =>
      approveBehaviorTemplateDraft(repositories, {
        draftId: draft.id
      }),
    /unresolved clauses/
  );

  await assert.rejects(
    () =>
      updateBehaviorTemplateDraft(repositories, {
        draftId: draft.id,
        patch: {
          suggestedBehavior: {
            engineSchemaVersion: 2,
            timing: "manual_review",
            targets: [],
            effects: []
          } as never
        }
      }),
    /Invalid literal value/
  );
});

test("card import validates groups separately from later behavior assignment", async () => {
  const repositories = createInMemoryCardCatalogAdminRepositories();
  const ogn = await readBundledSet("ogn");
  const importResult = await createCardImport(repositories, {
    cards: ogn,
    uploadedFileName: "ogn.json",
    importRunId: "catalog-import:ogn",
    now: new Date("2026-06-19T00:00:00.000Z")
  });
  const dariusGroup = importResult.groupingDrafts.find(
    (draft) => draft.cardCode === "OGN-027"
  );

  assert.ok(dariusGroup);
  assert.equal(
    dariusGroup.canonicalCard.variants.some(
      (variant) => variant.publicCode === "OGN-027a/298"
    ),
    true
  );
  assert.equal(
    await repositories.cardBehaviorAssignments.findByCardCode("OGN-027"),
    null
  );

  await createAndApproveDrawTemplate(repositories);

  const validatedGroup = await import("../src/server/card-catalog-admin").then(
    ({ updateCardGroupingDraft }) =>
      updateCardGroupingDraft(repositories, {
        groupId: dariusGroup.groupId,
        status: "validated",
        removedVariantPublicCodes: ["OGN-027a/298"],
        now: new Date("2026-06-19T00:01:00.000Z")
      })
  );
  const persistedCard = await repositories.canonicalCards.findByCardCode("OGN-027");
  const drawTemplate = (await repositories.behaviorTemplates.findAll())[0]!;
  const assignment = await assignBehaviorToCard(repositories, {
    cardCode: "OGN-027",
    behaviorTemplateId: drawTemplate.id,
    supportStatus: "fully_supported",
    assignedBy: "tester",
    now: new Date("2026-06-19T00:02:00.000Z")
  });

  assert.equal(validatedGroup.status, "validated");
  assert.ok(persistedCard);
  assert.equal(persistedCard.variants.length, 0);
  assert.equal(assignment.cardCode, "OGN-027");
  assert.equal(assignment.behaviorTemplateId, drawTemplate.id);
});

async function createAndApproveDrawTemplate(
  repositories: ReturnType<typeof createInMemoryCardCatalogAdminRepositories>
) {
  const result = await analyzeBehaviorTemplates(repositories, {
    cards: [
      createTestCard({
        name: "Draw Spell",
        publicCode: "TST-002/001",
        text: "Draw 1."
      })
    ],
    uploadedFileName: "draw.json",
    importRunId: "import:draw",
    now: new Date("2026-06-19T00:00:00.000Z")
  });
  const draft = result.drafts.find((candidate) => candidate.name === "Draw");

  assert.ok(draft);

  return approveBehaviorTemplateDraft(repositories, {
    draftId: draft.id,
    approvedBy: "tester",
    now: new Date("2026-06-19T00:00:30.000Z")
  });
}

async function readAllBundledCards() {
  return readBundledSet("all");
}

function createTestCard(input: {
  name: string;
  publicCode: string;
  text: string;
}): Card {
  return {
    id: input.publicCode,
    name: input.name,
    riftbound_id: input.publicCode,
    public_code: input.publicCode,
    attributes: {
      energy: 1,
      might: null,
      power: null
    },
    classification: {
      type: "Spell",
      supertype: null,
      rarity: "Common",
      domain: ["Mind"]
    },
    text: {
      plain: input.text
    },
    set: {
      set_id: "TST",
      label: "Test Set"
    },
    media: {},
    tags: [],
    metadata: {
      clean_name: input.name,
      alternate_art: false,
      overnumbered: false,
      signature: false
    }
  };
}

