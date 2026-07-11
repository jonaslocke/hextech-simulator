"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  DeckValidationRequest,
  DeckValidationResponse,
} from "@/shared/deck-validation";
import type { DeckConfiguration, SideboardingSessionInput } from "@/shared/game";
import { buildDeckValidationRequest } from "./build-deck-validation-request";

export type SideboardingValidationState = {
  error: string | null;
  isLatestLegal: boolean;
  pending: boolean;
  request: DeckValidationRequest;
  response: DeckValidationResponse | null;
  retry: () => void;
};

export function useSideboardingValidation(input: {
  draft: DeckConfiguration;
  session: SideboardingSessionInput;
  validateDeck: (
    candidate: DeckValidationRequest,
    signal?: AbortSignal,
  ) => Promise<DeckValidationResponse>;
}): SideboardingValidationState {
  const { draft, session, validateDeck } = input;
  const [response, setResponse] = useState<DeckValidationResponse | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const latestFingerprintRef = useRef<string | null>(null);
  const request = useMemo(
    () =>
      buildDeckValidationRequest({
        draft,
        session,
      }),
    [draft, session],
  );
  const fingerprint = useMemo(
    () => fingerprintDeckValidationRequest(request),
    [request],
  );

  useEffect(() => {
    const controller = new AbortController();
    latestFingerprintRef.current = fingerprint;
    setPending(true);
    setError(null);

    const timeoutId = window.setTimeout(() => {
      void validateDeck(request, controller.signal)
        .then((result) => {
          if (latestFingerprintRef.current !== result.fingerprint) return;
          setResponse(result);
          setError(null);
        })
        .catch((validationError) => {
          if (controller.signal.aborted) return;
          if (latestFingerprintRef.current !== fingerprint) return;
          setResponse(null);
          setError(
            validationError instanceof Error
              ? validationError.message
              : "Deck validation failed.",
          );
        })
        .finally(() => {
          if (
            !controller.signal.aborted &&
            latestFingerprintRef.current === fingerprint
          ) {
            setPending(false);
          }
        });
    }, 180);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [fingerprint, request, retryNonce, validateDeck]);

  const retry = useCallback(() => {
    setRetryNonce((current) => current + 1);
  }, []);

  return {
    error,
    isLatestLegal:
      !pending &&
      !error &&
      response?.fingerprint === fingerprint &&
      response.legal,
    pending,
    request,
    response,
    retry,
  };
}

function fingerprintDeckValidationRequest(request: DeckValidationRequest): string {
  const payload = JSON.stringify({
    policy: request.policy,
    deck: {
      legendRegisteredCardId: request.deck.legendRegisteredCardId,
      chosenChampionRegisteredCardId:
        request.deck.chosenChampionRegisteredCardId,
      mainDeckRegisteredCardIds: [...request.deck.mainDeckRegisteredCardIds],
      runeDeckRegisteredCardIds: [...request.deck.runeDeckRegisteredCardIds],
      battlefieldRegisteredCardIds: [
        ...request.deck.battlefieldRegisteredCardIds,
      ],
      sideboardRegisteredCardIds: [...request.deck.sideboardRegisteredCardIds],
    },
  });
  let hash = 2166136261;

  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16);
}
