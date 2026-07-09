"use client";

import type { GameProjection } from "@/shared/game";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BoardProjection } from "../board-view-model";
import { chainOverlayOpen } from "../model";

type SubmitProjectedAction = (actionId: string | undefined) => Promise<boolean>;

export function useChainOverlayState({
  actions,
  projection,
  submitProjectedAction,
}: {
  actions: GameProjection["actions"];
  projection: BoardProjection;
  submitProjectedAction: SubmitProjectedAction;
}) {
  const [isChainOverlayOpen, setIsChainOverlayOpen] = useState(false);
  const isChainLockedOpen = (projection.chain?.items.length ?? 0) > 0;
  const wasChainLockedOpen = useRef(isChainLockedOpen);
  const passPriorityAction = actions.find(
    (action) => action.label === "Pass priority",
  );
  const canViewerPassChain = isChainLockedOpen && Boolean(passPriorityAction);
  const onPassPriority = useCallback(
    () => submitProjectedAction(passPriorityAction?.id),
    [passPriorityAction?.id, submitProjectedAction],
  );
  const chainPassWillResolve =
    canViewerPassChain &&
    projection.chain !== null &&
    projection.chain.relevantPlayerIds.every(
      (playerId) =>
        playerId === projection.viewerPlayerId ||
        projection.chain?.passedPlayerIds.includes(playerId),
    );
  const chainPassLabel = chainPassWillResolve
    ? "Pass and Resolve"
    : "Pass Priority";

  useEffect(() => {
    setIsChainOverlayOpen((isOpen) =>
      chainOverlayOpen(isOpen, wasChainLockedOpen.current, isChainLockedOpen),
    );
    wasChainLockedOpen.current = isChainLockedOpen;
  }, [isChainLockedOpen]);

  return {
    canViewerPassChain,
    chainPassLabel,
    chainPassWillResolve,
    isChainLockedOpen,
    isChainOverlayOpen,
    onPassPriority,
    passPriorityAction,
    setIsChainOverlayOpen,
  };
}
