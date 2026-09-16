"use client";

import { useCallback } from "react";
import {
  fingerprintDeckValidationRequest,
  type DeckValidationRequest,
  type DeckValidationResponse,
} from "@/shared/deck-validation";
import type {
  MatchProjection,
  SideboardingSessionInput,
} from "@/shared/game";
import { SideboardingScreen } from "../sideboarding-screen";
import { validateDeckClient } from "../api/validate-deck";
import { buildPlaygroundDecklistRequest } from "../build-playground-decklist-request";

export function SideboardingPlayground({
  projection,
  session,
  deckNamesByRegisteredId,
}: {
  projection: MatchProjection;
  session: SideboardingSessionInput;
  deckNamesByRegisteredId: Record<string, string>;
}) {
  const validateDeck = useCallback(
    async (request: DeckValidationRequest, signal?: AbortSignal): Promise<DeckValidationResponse> => {
      if (request.input !== "registered") throw new Error("Expected a registered playground draft.");
      const textRequest = buildPlaygroundDecklistRequest(request, deckNamesByRegisteredId);
      const result = await validateDeckClient(textRequest, signal);
      if (result.fingerprint !== fingerprintDeckValidationRequest(textRequest)) {
        throw new Error("Deck validation returned a result for a different playground draft.");
      }
      return {
        ...result,
        fingerprint: fingerprintDeckValidationRequest(request),
      };
    },
    [deckNamesByRegisteredId],
  );

  const handleIntent = useCallback(async () => {
    return {
      accepted: false as const,
      message: "This is a visual playground. Changes are not submitted to a match.",
    };
  }, []);

  return (
    <SideboardingScreen
      onIntent={handleIntent}
      projection={projection}
      session={session}
      validateDeck={validateDeck}
    />
  );
}
