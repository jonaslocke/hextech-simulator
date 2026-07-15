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
import { FixedDeckPanel } from "./components/fixed-deck-panel";
import { SideboardingEditorWorkspace } from "./components/sideboarding-editor-workspace";
import { SideboardingHeader } from "./components/sideboarding-header";
import { SideboardingLayout } from "./components/sideboarding-layout";
import { SideboardingRightRail } from "./components/sideboarding-right-rail";
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
    <main className="tabletop-background flex h-dvh min-h-0 flex-col overflow-hidden bg-slate-950 text-slate-100">
      <SideboardingHeader projection={projection} session={session} />

      {submissionError && (
        <div className="border-b border-red-400/30 bg-red-950/80 px-4 py-2 text-sm text-red-100">
          {submissionError}
        </div>
      )}

      <SideboardingLayout
        center={
          <SideboardingEditorWorkspace
            disabled={editingDisabled}
            mode={editorMode}
            onDispatch={dispatchAndTrack}
            onInspect={setSelectedRegisteredCardId}
            onModeChange={setEditorMode}
            viewModel={viewModel}
          />
        }
        left={<FixedDeckPanel viewModel={viewModel} />}
        right={
          <SideboardingRightRail
            disabled={editingDisabled}
            isSubmitting={isSubmitting}
            onDispatch={dispatchAndTrack}
            onSubmit={submit}
            validation={validation}
            viewModel={viewModel}
          />
        }
      />
    </main>
  );
}
