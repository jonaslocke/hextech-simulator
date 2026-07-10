"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DecisionInspectionZone } from "../decisions/decision-inspection-policy";
import type { DecisionInspectionRequest } from "./decision-inspection-request";

type DecisionInspectionState =
  | { mode: "decision" }
  | { decisionKey: string; mode: "board" }
  | {
      decisionKey: string;
      mode: "zone";
      playerId: string;
      zone: DecisionInspectionZone;
    };

export function useDecisionInspection({
  request,
}: {
  request: DecisionInspectionRequest | null;
}) {
  const decisionKey = request?.decisionKey ?? null;
  const policy = request?.policy ?? "none";
  const decisionTitle = request?.title ?? "Decision";
  const [state, setState] = useState<DecisionInspectionState>({
    mode: "decision",
  });
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const currentState =
    state.mode !== "decision" && state.decisionKey === decisionKey
      ? state
      : ({ mode: "decision" } as const);
  const canInspect = Boolean(request);
  const isInspecting = currentState.mode !== "decision";

  useEffect(() => {
    returnFocusRef.current = null;
    setState((current) => {
      if (
        current.mode === "decision" ||
        (decisionKey && current.decisionKey === decisionKey)
      ) {
        return current;
      }

      return { mode: "decision" };
    });
  }, [decisionKey]);

  const inspectBoard = useCallback(() => {
    if (!decisionKey) {
      return;
    }

    returnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setState({ decisionKey, mode: "board" });
  }, [decisionKey]);

  const inspectZone = useCallback(
    (playerId: string, zone: DecisionInspectionZone) => {
      if (!decisionKey || policy !== "publicGameState") {
        return;
      }

      setState({ decisionKey, mode: "zone", playerId, zone });
    },
    [decisionKey, policy],
  );

  const closeZone = useCallback(() => {
    if (!decisionKey) {
      setState({ mode: "decision" });
      return;
    }

    setState({ decisionKey, mode: "board" });
  }, [decisionKey]);

  const returnToDecision = useCallback(() => {
    const returnFocusTarget = returnFocusRef.current;

    setState({ mode: "decision" });
    returnFocusRef.current = null;

    window.requestAnimationFrame(() => {
      returnFocusTarget?.focus();
    });
  }, []);

  useEffect(() => {
    if (!isInspecting) {
      return;
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (currentState.mode === "zone") {
        closeZone();
        return;
      }

      returnToDecision();
    }

    window.addEventListener("keydown", handleEscape, true);

    return () => {
      window.removeEventListener("keydown", handleEscape, true);
    };
  }, [closeZone, currentState.mode, isInspecting, returnToDecision]);

  return {
    canInspect,
    closeZone,
    decisionTitle,
    inspectBoard,
    inspectZone,
    isInspecting,
    policy,
    request,
    returnToDecision,
    state: currentState,
  };
}
