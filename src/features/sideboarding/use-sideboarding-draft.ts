"use client";

import { useMemo, useReducer } from "react";
import type { SideboardingSessionInput } from "@/shared/game";
import {
  createSideboardingDraftReducer,
  type SideboardingDraftAction,
} from "./sideboarding-draft-reducer";

export function useSideboardingDraft(session: SideboardingSessionInput) {
  const reducer = useMemo(
    () =>
      createSideboardingDraftReducer({
        originalRegisteredDeck: session.originalRegisteredDeck,
      }),
    [session.originalRegisteredDeck],
  );
  const [draft, dispatch] = useReducer(
    reducer,
    session.currentDeckConfiguration,
  );

  return {
    dispatch: dispatch as (action: SideboardingDraftAction) => void,
    draft,
  };
}
