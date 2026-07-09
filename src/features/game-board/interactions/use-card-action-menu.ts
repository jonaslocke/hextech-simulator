"use client";

import { useCallback, useEffect, useState, type MouseEvent } from "react";
import type {
  BoardLocation,
  CardActionMenuItem,
  CardActionMenuState,
} from "../components/card-action-menu";

const MENU_WIDTH = 180;
const MENU_MIN_HEIGHT = 44;
const MENU_ITEM_HEIGHT = 36;
const MENU_VERTICAL_PADDING = 12;
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

      const menuHeight = Math.max(
        MENU_MIN_HEIGHT,
        items.length * MENU_ITEM_HEIGHT + MENU_VERTICAL_PADDING,
      );

      setCardActionMenu({
        items,
        left: Math.min(
          event.clientX,
          Math.max(
            VIEWPORT_GUTTER,
            window.innerWidth - MENU_WIDTH - VIEWPORT_GUTTER,
          ),
        ),
        top: Math.min(
          event.clientY,
          Math.max(
            VIEWPORT_GUTTER,
            window.innerHeight - menuHeight - VIEWPORT_GUTTER,
          ),
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

  useEffect(() => {
    if (!cardActionMenu) {
      return;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeCardActionMenu();
      }
    };

    window.addEventListener("pointerdown", closeCardActionMenu);
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      window.removeEventListener("pointerdown", closeCardActionMenu);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [cardActionMenu, closeCardActionMenu]);

  return {
    cardActionMenu,
    clearCardActionMenuHighlight,
    closeCardActionMenu,
    hoveredBoardLocation,
    openCardActionMenu,
    setCardActionMenuHighlight,
  };
}
