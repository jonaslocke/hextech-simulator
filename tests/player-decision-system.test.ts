import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createCombatDamageIntent,
  createSelectionIntent,
} from "../src/features/game-board/decisions/player-decision-intent";
import { buildPlayerDecisionRequest } from "../src/features/game-board/decisions/use-player-decision-request";
import type { GameProjection, ProjectedCardView } from "../src/shared/game";

test("maps Vision to card selection and keeps the top card with an empty selection", () => {
  const revealedCard = card("revealed-card");
  const projection = projectionWith({
    actions: [
      {
        choice: {
          choiceId: "vision-choice",
          kind: "effectSelection",
          prompt: "Choose cards to recycle.",
        },
        disabledReason: null,
        enabled: true,
        id: "vision-action",
        label: "Vision",
        presentation: {
          prompt: null,
          style: "primary",
          surface: "choice-dialog",
        },
        sourceCardInstanceId: null,
        targets: [
          {
            kind: "card",
            legalIds: [revealedCard.instanceId],
            maximum: 1,
            minimum: 0,
            sourceZone: "mainDeck",
          },
        ],
      },
    ],
    pendingChoice: {
      id: "vision-choice",
      maximum: 1,
      minimum: 0,
      playerId: "player-1",
      presentation: "vision",
      prompt: "Choose cards to recycle.",
      revealedCards: [revealedCard],
      sourceZone: "mainDeck",
      title: "Vision",
      type: "effectSelection",
      waitingMessage: "Waiting for Vision.",
    },
  });

  const decision = buildPlayerDecisionRequest({
    cardsByInstanceId: {},
    sourceProjection: projection,
  });

  assert.equal(decision?.kind, "cardSelection");
  if (decision?.kind !== "cardSelection") return;
  assert.deepEqual(decision.cards.map((item) => item.id), ["revealed-card"]);
  assert.equal(decision.minSelected, 0);
  const refreshedDecision = buildPlayerDecisionRequest({
    cardsByInstanceId: {},
    sourceProjection: structuredClone(projection),
  });
  assert.equal(refreshedDecision?.kind, "cardSelection");
  if (refreshedDecision?.kind === "cardSelection") {
    assert.equal(refreshedDecision.decisionKey, decision.decisionKey);
  }

  const nextProjection = structuredClone(projection);
  if (nextProjection.pendingChoice?.type === "effectSelection") {
    nextProjection.pendingChoice.id = "next-vision-choice";
  }
  const nextActionChoice = nextProjection.actions[0]?.choice;
  if (nextActionChoice?.kind === "effectSelection") {
    nextActionChoice.choiceId = "next-vision-choice";
  }
  const nextDecision = buildPlayerDecisionRequest({
    cardsByInstanceId: {},
    sourceProjection: nextProjection,
  });
  assert.equal(nextDecision?.kind, "cardSelection");
  if (nextDecision?.kind === "cardSelection") {
    assert.notEqual(nextDecision.decisionKey, decision.decisionKey);
  }
  assert.equal(typeof decision.confirmLabel, "function");
  if (typeof decision.confirmLabel === "function") {
    assert.equal(decision.confirmLabel([]), "Keep on top");
  }
  assert.deepEqual(createSelectionIntent(decision.actionId, []), {
    actionId: "vision-action",
    selectedIds: [],
  });
});

test("builds combat damage intents without changing allocation payloads", () => {
  const allocations = [{ amount: 3, targetUnitId: "unit-1" }];

  assert.deepEqual(createCombatDamageIntent("combat-action", allocations), {
    actionId: "combat-action",
    allocations,
    selectedIds: [],
  });
});

test("maps an initiated non-board card target to a card selection decision", () => {
  const trashUnit = card("trash-unit", "Unit");
  const action = cardTargetAction({
    id: "return-action",
    label: "unit from trash",
    legalIds: [trashUnit.instanceId],
  });
  const projection = projectionWith({
    actions: [action],
    pendingChoice: null,
  });
  const trash = projection.players[0]?.zones.find(
    (zone) => zone.kind === "trash",
  );
  assert.ok(trash);
  trash.cards = [trashUnit];
  trash.count = 1;

  const decision = buildPlayerDecisionRequest({
    activeTargetSelection: {
      actionId: action.id,
      legalTargetIds: [trashUnit.instanceId],
      maxTargets: 1,
      minTargets: 1,
      targetKind: "card",
    },
    cardsByInstanceId: {},
    sourceProjection: projection,
  });

  assert.equal(decision?.kind, "cardSelection");
  if (decision?.kind !== "cardSelection") return;
  assert.equal(decision.title, "Choose from Trash");
  assert.equal(decision.description, "Choose unit from trash");
  assert.deepEqual(decision.cards.map((item) => item.id), ["trash-unit"]);
  assert.equal(decision.actionId, "return-action");
});

test("keeps initiated battlefield card targets out of card selection prompts", () => {
  const battlefieldUnit = card("battlefield-unit", "Unit");
  const action = cardTargetAction({
    id: "damage-action",
    label: "unit at a battlefield",
    legalIds: [battlefieldUnit.instanceId],
  });
  const projection = projectionWith({
    actions: [action],
    pendingChoice: null,
  });
  projection.battlefields = [
    {
      battlefieldId: "battlefield-1",
      card: card("battlefield-card", "Battlefield"),
      contestedByPlayerId: null,
      controllerPlayerId: "player-2",
      facedownCard: null,
      selectedByPlayerId: "player-2",
      units: [battlefieldUnit],
    },
  ];

  const decision = buildPlayerDecisionRequest({
    activeTargetSelection: {
      actionId: action.id,
      legalTargetIds: [battlefieldUnit.instanceId],
      maxTargets: 1,
      minTargets: 1,
      targetKind: "card",
    },
    cardsByInstanceId: {},
    sourceProjection: projection,
  });

  assert.equal(decision, null);
});

function projectionWith(
  overrides: Pick<GameProjection, "actions" | "pendingChoice">,
): GameProjection {
  return {
    actions: overrides.actions,
    activePlayerId: "player-1",
    battlefields: [],
    chain: null,
    combat: null,
    gameNumber: 1,
    id: "game-1",
    logEntries: [],
    matchId: "match-1",
    pendingChoice: overrides.pendingChoice,
    players: [
      player("player-1", true),
      player("player-2", false),
    ],
    setup: {
      battlefieldChoices: {},
      battlefieldPool: [],
      mulligans: {},
      playerIds: ["player-1", "player-2"],
      startingPlayerChooserId: "player-1",
      startingPlayerId: "player-1",
      waitingReason: null,
    },
    showdown: null,
    stateVersion: 1,
    status: "in_progress",
    turn: {
      activePlayerId: "player-1",
      passedPlayerIds: [],
      phase: "action",
      turnNumber: 1,
    },
    victoryScore: 8,
    viewerPlayerId: "player-1",
    winnerPlayerId: null,
  };
}

function player(playerId: string, isViewer: boolean): GameProjection["players"][number] {
  return {
    conditionalEnergy: 0,
    energy: 0,
    isViewer,
    playerId,
    points: 0,
    power: {},
    zones: [
      "legend",
      "champion",
      "mainDeck",
      "runeDeck",
      "hand",
      "trash",
      "banishment",
      "base",
    ].map((kind) => ({
      cards: [],
      count: 0,
      kind: kind as GameProjection["players"][number]["zones"][number]["kind"],
      visibility: "public",
    })),
  };
}

function card(
  instanceId: string,
  type: string = "Spell",
): ProjectedCardView {
  return {
    computedMight: null,
    damage: 0,
    domains: [],
    energy: 1,
    exhausted: false,
    imageUrl: "/card.webp",
    instanceId,
    might: null,
    name: "Revealed Card",
    ownerPlayerId: "player-1",
    power: null,
    publicCode: "test-001",
    rulesText: "Test card",
    supertype: null,
    type,
  };
}

function cardTargetAction({
  id,
  label,
  legalIds,
}: {
  id: string;
  label: string;
  legalIds: string[];
}): GameProjection["actions"][number] {
  return {
    disabledReason: null,
    enabled: true,
    id,
    label: "Play card",
    presentation: {
      prompt: null,
      style: "primary",
      surface: "card-menu",
    },
    sourceCardInstanceId: "source-card",
    targets: [
      {
        kind: "card",
        label,
        legalIds,
        maximum: 1,
        minimum: 1,
      },
    ],
  };
}
