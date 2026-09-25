"use client";

import { useCallback, useState, type MouseEvent } from "react";
import type {
  BoardLocation,
  CardActionMenuItem,
  CardActionMenuState,
} from "../components/card-action-menu";

const VIEWPORT_GUTTER = 8;

export function useCardActionMenu() {
  const [cardActionMenu, setCardActionMenu] =
    useState<CardActionMenuState>(null);
  const [hoveredBoardLocation, setHoveredBoardLocation] =
    useState<BoardLocation | null>(null);

  const closeCardActionMenu = useCallback(() => {
    setCardActionMenu(null);
    setHoveredBoardLocation(null);
  }, []);

  const openCardActionMenu = useCallback(
    (event: MouseEvent<HTMLElement>, items: CardActionMenuItem[]) => {
      if (items.length === 0) {
        closeCardActionMenu();
        return;
      }

      setHoveredBoardLocation(null);

      setCardActionMenu({
        items,
        left: Math.min(
          event.clientX,
          Math.max(VIEWPORT_GUTTER, window.innerWidth - VIEWPORT_GUTTER),
        ),
        top: Math.min(
          event.clientY,
          Math.max(VIEWPORT_GUTTER, window.innerHeight - VIEWPORT_GUTTER),
        ),
      });
    },
    [closeCardActionMenu],
  );

  const setCardActionMenuHighlight = useCallback((item: CardActionMenuItem) => {
    setHoveredBoardLocation(item.boardLocation ?? null);
  }, []);

  const clearCardActionMenuHighlight = useCallback(() => {
    setHoveredBoardLocation(null);
  }, []);

  return {
    cardActionMenu,
    clearCardActionMenuHighlight,
    closeCardActionMenu,
    hoveredBoardLocation,
    openCardActionMenu,
    setCardActionMenuHighlight,
  };
}
