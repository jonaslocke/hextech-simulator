import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildDeckValidationRequest } from "../src/features/sideboarding/build-deck-validation-request";
import { buildPlaygroundDecklistRequest } from "../src/features/sideboarding/build-playground-decklist-request";
import { buildSideboardingViewModel } from "../src/features/sideboarding/sideboarding-view-model";
import { createSideboardingDraftReducer } from "../src/features/sideboarding/sideboarding-draft-reducer";
import type { SideboardingSessionInput } from "../src/shared/game";
import { SideboardingActions } from "../src/features/sideboarding/components/sideboarding-actions";
import type { SideboardingValidationState } from "../src/features/sideboarding/use-sideboarding-validation";

// The app preserves JSX for Next.js; the Node test runner uses the classic JSX runtime.
Object.assign(globalThis, { React });

function sessionFixture() {
  const configuration = {
    chosenChampionRegisteredCardId: "champion",
    mainDeckRegisteredCardIds: ["main-1", "main-2"],
    sideboardRegisteredCardIds: ["side-1"],
  };
  return {
    matchId: "match",
    playerId: "player",
    gameNumber: 2,
    expectedIntermissionVersion: 1,
    originalRegisteredDeck: {
      ...configuration,
      legendRegisteredCardId: "legend",
      runeDeckRegisteredCardIds: [],
      battlefieldRegisteredCardIds: [],
    },
    currentDeckConfiguration: configuration,
    eligibleChosenChampionRegisteredCardIds: ["champion", "side-1"],
    registeredCardPool: [],
    cardsByCode: {},
    validationConstraints: {
      legend: { exact: 1 },
      chosenChampion: { exact: 1 },
      mainDeck: { minimum: 6, maximum: null, includesChosenChampion: true },
      runeDeck: { exact: 2 },
      battlefields: { exact: 1, unique: true },
      sideboard: { maximum: 3 },
    },
    context: {
      previousGameWinnerPlayerId: "player",
      previousGameLoserPlayerId: "opponent",
      nextStartingPlayerChooserId: "player",
      usedBattlefieldRegisteredCardIds: [],
      remainingBattlefieldRegisteredCardIds: [],
      nextBattlefieldMode: "player-choice",
    },
    opponentStatus: "editing",
  } satisfies SideboardingSessionInput;
}

test("sideboarding carries applicable constraints without reconstructing policy", () => {
  const session = sessionFixture();
  const viewModel = buildSideboardingViewModel({
    draft: session.currentDeckConfiguration,
    selectedRegisteredCardId: null,
    session,
  });
  assert.deepEqual(viewModel.constraints, session.validationConstraints);
  assert.equal(viewModel.counts.active, 3);
  assert.equal(viewModel.counts.mainDeck, 2);
});

test("sideboarding requests explicitly select registered validation", () => {
  const session = sessionFixture();
  const request = buildDeckValidationRequest({
    draft: session.currentDeckConfiguration,
    session,
  });
  assert.equal(request.input, "registered");
  assert.deepEqual(request.deck.mainDeckRegisteredCardIds, ["main-1", "main-2"]);
});

test("draft movement and Champion replacement preserve physical copies and allow invalid edits", () => {
  const session = sessionFixture();
  const reducer = createSideboardingDraftReducer({
    originalRegisteredDeck: session.originalRegisteredDeck,
  });
  let draft = session.currentDeckConfiguration;
  for (const registeredCardId of ["main-1", "main-2"]) {
    draft = reducer(draft, { type: "moveMainDeckCopyToSideboard", registeredCardId });
  }
  assert.deepEqual(draft.mainDeckRegisteredCardIds, []);
  assert.deepEqual(draft.sideboardRegisteredCardIds, ["side-1", "main-1", "main-2"]);
  draft = reducer(draft, { type: "setChosenChampion", registeredCardId: "side-1" });
  assert.equal(draft.chosenChampionRegisteredCardId, "side-1");
  assert.deepEqual(draft.sideboardRegisteredCardIds, ["main-1", "main-2", "champion"]);
  assert.deepEqual(
    reducer(draft, { type: "resetToRegisteredDeck" }),
    session.currentDeckConfiguration,
  );
});

test("the shared card layout and counters adapt to server constraints", () => {
  const session = sessionFixture();
  const viewModel = buildSideboardingViewModel({
    draft: session.currentDeckConfiguration,
    selectedRegisteredCardId: null,
    session,
  });
  assert.match(viewModel.cardGridStyle.gridTemplateColumns, /^repeat\(3,/);
  assert.match(viewModel.countLabels.sideboard, /maximum 3/);
  assert.match(viewModel.countLabels.active, /minimum 6/);
  assert.match(viewModel.cardWorkspaceStyle["--sideboarding-card-width"], /\/ 3/);
});

test("server reasons render generically and keep submission unavailable", () => {
  const session = sessionFixture();
  const viewModel = buildSideboardingViewModel({
    draft: session.currentDeckConfiguration,
    selectedRegisteredCardId: null,
    session,
  });
  const validation: SideboardingValidationState = {
    error: null,
    pending: false,
    isLatestLegal: false,
    retry() {},
    request: buildDeckValidationRequest({ draft: session.currentDeckConfiguration, session }),
    response: {
      legal: false,
      fingerprint: "current",
      constraints: session.validationConstraints,
      reasons: [{ code: "future.requirement", message: "An additional server requirement applies.", section: "sideboard" }],
      summary: { activeCardCount: 3, mainDeckCount: 2, sideboardCount: 1, signatureCount: 0, legendCount: 1, chosenChampionCount: 1, runeDeckCount: 0, battlefieldCount: 0 },
    },
  };
  const html = renderToStaticMarkup(React.createElement(SideboardingActions, {
    disabled: false,
    isSubmitting: false,
    onDispatch() {},
    onSubmit() {},
    validation,
    viewModel,
  }));
  assert.match(html, /An additional server requirement applies/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>[\s\S]*Submit no changes/);
  assert.match(html, /minimum 6/);
  assert.match(html, /maximum 3/);
});

test("playground draft serialization preserves exact names and each physical copy", () => {
  const session = sessionFixture();
  const request = buildDeckValidationRequest({ draft: session.currentDeckConfiguration, session });
  const text = buildPlaygroundDecklistRequest(request, {
    legend: "Example, Exact Legend Title",
    champion: "Example, Chosen",
    "main-1": "Example Card",
    "main-2": "Example Card",
    "side-1": "Example Reserve",
  });
  assert.equal(text.input, "text");
  assert.match(text.sourceText, /Legend:\n1 Example, Exact Legend Title/);
  assert.match(text.sourceText, /MainDeck:\n2 Example Card/);
  assert.match(text.sourceText, /Sideboard:\n1 Example Reserve/);
  const reducer = createSideboardingDraftReducer({ originalRegisteredDeck: session.originalRegisteredDeck });
  const largerDraft = reducer(session.currentDeckConfiguration, {
    type: "moveSideboardCopyToMainDeck",
    registeredCardId: "side-1",
  });
  const largerText = buildPlaygroundDecklistRequest(
    buildDeckValidationRequest({ draft: largerDraft, session }),
    { legend: "Example, Exact Legend Title", champion: "Example, Chosen", "main-1": "Example Card", "main-2": "Example Card", "side-1": "Example Reserve" },
  );
  assert.match(largerText.sourceText, /MainDeck:\n2 Example Card\n1 Example Reserve/);
  assert.match(largerText.sourceText, /Sideboard:\n\nRunes:/);
});

test("valid above-minimum counts do not introduce client-side warnings", () => {
  const session = sessionFixture();
  const draft = { ...session.currentDeckConfiguration, mainDeckRegisteredCardIds: Array.from({ length: 8 }, (_, index) => `copy-${index}`) };
  const viewModel = buildSideboardingViewModel({ draft, selectedRegisteredCardId: null, session });
  const validation: SideboardingValidationState = {
    error: null,
    pending: false,
    isLatestLegal: true,
    retry() {},
    request: buildDeckValidationRequest({ draft, session }),
    response: {
      legal: true,
      fingerprint: "current",
      constraints: session.validationConstraints,
      reasons: [],
      summary: { activeCardCount: 9, mainDeckCount: 8, sideboardCount: 1, signatureCount: 0, legendCount: 1, chosenChampionCount: 1, runeDeckCount: 0, battlefieldCount: 0 },
    },
  };
  const html = renderToStaticMarkup(React.createElement(SideboardingActions, {
    disabled: false, isSubmitting: false, onDispatch() {}, onSubmit() {}, validation, viewModel,
  }));
  assert.match(html, /9 · minimum 6/);
  assert.doesNotMatch(html, /border-amber|disabled=""/);
  assert.match(html, /Deck is legal/);
});
