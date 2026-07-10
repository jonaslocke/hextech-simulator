"use client";

import { X } from "lucide-react";
import { cn } from "@/shared/utils/cn";
import { GameActionButton } from "./game-action-button";

export function OverlayCloseButton({
  autoFocus = false,
  className,
  disabled = false,
  enableShortcut = true,
  displayShortcut = enableShortcut,
  label = "Close overlay",
  onClose,
}: {
  autoFocus?: boolean;
  className?: string;
  disabled?: boolean;
  displayShortcut?: boolean;
  enableShortcut?: boolean;
  label?: string;
  onClose: () => void;
}) {
  return (
    <GameActionButton
      actionSlot="cancel"
      aria-label={label}
      autoFocus={autoFocus}
      className={cn(
        "px-1.5 min-w-0 h-7",
        !displayShortcut && "w-7 px-0",
        className,
      )}
      disabled={disabled}
      isActive={enableShortcut && !disabled}
      keyboardEnabled={enableShortcut}
      keybindClassName="hidden sm:inline-flex"
      onAction={onClose}
      showKeybind={displayShortcut && !disabled}
      size="compact"
      variant="secondary"
    >
      <X aria-hidden="true" className="size-4" />
    </GameActionButton>
  );
}
