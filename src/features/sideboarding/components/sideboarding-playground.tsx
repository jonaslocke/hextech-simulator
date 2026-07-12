"use client";

import { useCallback } from "react";
import type {
  DeckValidationRequest,
  DeckValidationResponse,
} from "@/shared/deck-validation";
import type {
  MatchProjection,
  SideboardingSessionInput,
} from "@/shared/game";
import { SideboardingScreen } from "../sideboarding-screen";
import { fingerprintDeckValidationRequest } from "../use-sideboarding-validation";

export function SideboardingPlayground({
  projection,
  session,
}: {
  projection: MatchProjection;
  session: SideboardingSessionInput;
}) {
  const validateDeck = useCallback(
    async (request: DeckValidationRequest): Promise<DeckValidationResponse> => {
      const fingerprint = fingerprintDeckValidationRequest(request);
      const mainDeckCount = request.deck.mainDeckRegisteredCardIds.length;
      const sideboardCount = request.deck.sideboardRegisteredCardIds.length;
      const reasons: DeckValidationResponse["reasons"] = [];

      if (mainDeckCount !== 39) {
        reasons.push({
          code: "playground.mainDeckSize",
          message: "Main Deck must contain 39 cards.",
          section: "mainDeck",
        });
      }
      if (sideboardCount > 8) {
        reasons.push({
          code: "playground.sideboardSize",
          message: "Sideboard can contain at most 8 cards.",
          section: "sideboard",
        });
      }

      return {
        legal: reasons.length === 0,
        fingerprint,
        reasons,
        summary: {
          activeCardCount: mainDeckCount + 1,
          mainDeckCount,
          sideboardCount,
          signatureCount: 0,
        },
      };
    },
    [],
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
