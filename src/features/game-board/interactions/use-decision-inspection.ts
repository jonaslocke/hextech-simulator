"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  DecisionInspectionPolicy,
  DecisionInspectionZone,
} from "../decisions/decision-inspection-policy";
import type { PlayerDecisionRequest } from "../decisions/player-decision-types";

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
  decision,
}: {
  decision: PlayerDecisionRequest | null;
}) {
  const policy = decision?.inspection ?? "none";
  const decisionKey = useMemo(
    () => getInspectableDecisionKey(decision, policy),
    [decision, policy],
  );
  const decisionTitle = getDecisionTitle(decision);
  const [state, setState] = useState<DecisionInspectionState>({
    mode: "decision",
  });
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const currentState =
    state.mode !== "decision" && state.decisionKey === decisionKey
      ? state
      : ({ mode: "decision" } as const);
  const canInspect = Boolean(decisionKey);
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
    returnToDecision,
    state: currentState,
  };
}

function getInspectableDecisionKey(
  decision: PlayerDecisionRequest | null,
  policy: DecisionInspectionPolicy,
) {
  if (!decision || policy === "none" || decision.kind === "pendingDecision") {
    return null;
  }

  switch (decision.kind) {
    case "cardSelection":
    case "optionDecision":
    case "orderedDecision":
      return `${policy}:${decision.kind}:${decision.decisionKey}`;
    case "combatDamage":
      return `${policy}:${decision.kind}:${decision.decisionKey ?? decision.actionId}`;
  }
}

function getDecisionTitle(decision: PlayerDecisionRequest | null) {
  if (!decision) {
    return "Decision";
  }

  switch (decision.kind) {
    case "combatDamage":
      return "Assign combat damage";
    default:
      return decision.title;
  }
}
