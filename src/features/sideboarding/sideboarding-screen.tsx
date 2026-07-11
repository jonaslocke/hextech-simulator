"use client";

import { useMemo, useState } from "react";
import type {
  DeckValidationRequest,
  DeckValidationResponse,
} from "@/shared/deck-validation";
import type { MatchProjection, SideboardingSessionInput } from "@/shared/game";
import { buildDeckReconfigurationIntent } from "./build-deck-reconfiguration-intent";
import type { SideboardingDraftAction } from "./sideboarding-draft-reducer";
import type {
  DeckReconfigurationIntent,
  IntentResult,
  SideboardingEditorMode,
} from "./sideboarding-types";
import { buildSideboardingViewModel } from "./sideboarding-view-model";
import { useSideboardingDraft } from "./use-sideboarding-draft";
import { useSideboardingValidation } from "./use-sideboarding-validation";
import { CardInspector } from "./components/card-inspector";
import { DeckIdentityPanel } from "./components/deck-identity-panel";
import { EditorToolbar } from "./components/editor-toolbar";
import { MainDeckEditor } from "./components/main-deck-editor";
import { SideboardEditor } from "./components/sideboard-editor";
import { SideboardingActions } from "./components/sideboarding-actions";
import { SideboardingHeader } from "./components/sideboarding-header";
import { SideboardingWaitingState } from "./components/sideboarding-waiting-state";

export function SideboardingScreen({
  onIntent,
  projection,
  session,
  validateDeck,
}: {
  onIntent: (intent: DeckReconfigurationIntent) => Promise<IntentResult>;
  projection: MatchProjection;
  session: SideboardingSessionInput;
  validateDeck: (
    candidate: DeckValidationRequest,
    signal?: AbortSignal,
  ) => Promise<DeckValidationResponse>;
}) {
  const [editorMode, setEditorMode] =
    useState<SideboardingEditorMode>("compact");
  const [selectedRegisteredCardId, setSelectedRegisteredCardId] = useState<
    string | null
  >(session.currentDeckConfiguration.chosenChampionRegisteredCardId);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(
    projection.betweenGames?.viewerStatus === "submitted",
  );
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const { dispatch, draft } = useSideboardingDraft(session);
  const validation = useSideboardingValidation({
    draft,
    session,
    validateDeck,
  });
  const viewModel = useMemo(
    () =>
      buildSideboardingViewModel({
        draft,
        selectedRegisteredCardId,
        session,
      }),
    [draft, selectedRegisteredCardId, session],
  );
  const editingDisabled = isSubmitting || submitted;

  function dispatchAndTrack(action: SideboardingDraftAction) {
    dispatch(action);
    if ("registeredCardId" in action) {
      setSelectedRegisteredCardId(action.registeredCardId);
    }
    if (action.type === "resetToRegisteredDeck") {
      setSelectedRegisteredCardId(
        session.originalRegisteredDeck.chosenChampionRegisteredCardId,
      );
    }
  }

  async function submit() {
    if (!validation.isLatestLegal || isSubmitting || submitted) return;

    setIsSubmitting(true);
    setSubmissionError(null);

    try {
      const result = await onIntent(
        buildDeckReconfigurationIntent({ draft, session }),
      );
      if (result.accepted) {
        setSubmitted(true);
      } else {
        setSubmissionError(result.message);
      }
    } catch (error) {
      setSubmissionError(
        error instanceof Error ? error.message : "Submission failed.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <SideboardingWaitingState
        opponentSubmitted={session.opponentStatus === "submitted"}
      />
    );
  }

  return (
    <main className="flex h-screen min-h-0 flex-col overflow-hidden bg-slate-950 text-slate-100 tabletop-background">
      <SideboardingHeader
        projection={projection}
        session={session}
      />
      <DeckIdentityPanel viewModel={viewModel} />
      {submissionError && (
        <div className="border-red-400/30 border-b bg-red-950/80 px-4 py-2 text-red-100 text-sm">
          {submissionError}
        </div>
      )}
      <section
        className={[
          "grid min-h-0 flex-1 gap-3 p-3",
          editorMode === "allCards"
            ? "lg:grid-cols-1"
            : "lg:grid-cols-[minmax(0,1fr)_18rem]",
        ].join(" ")}
      >
        <div className="flex min-h-0 flex-col overflow-hidden rounded-md border border-white/10 bg-slate-950/60">
          <EditorToolbar mode={editorMode} onModeChange={setEditorMode} />
          <div className="grid min-h-0 flex-1 gap-3 p-3 md:grid-cols-[minmax(0,1.35fr)_minmax(16rem,0.65fr)]">
            <MainDeckEditor
              disabled={editingDisabled}
              groups={viewModel.mainDeckGroups}
              mode={editorMode}
              onDispatch={dispatchAndTrack}
              onInspect={setSelectedRegisteredCardId}
              viewModel={viewModel}
            />
            <SideboardEditor
              disabled={editingDisabled}
              groups={viewModel.sideboardGroups}
              mode={editorMode}
              onDispatch={dispatchAndTrack}
              onInspect={setSelectedRegisteredCardId}
              viewModel={viewModel}
            />
          </div>
        </div>
        {editorMode !== "allCards" && <CardInspector card={viewModel.selectedCard} />}
      </section>
      <SideboardingActions
        disabled={editingDisabled}
        isSubmitting={isSubmitting}
        onDispatch={dispatchAndTrack}
        onSubmit={submit}
        validation={validation}
        viewModel={viewModel}
      />
    </main>
  );
}
