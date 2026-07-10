"use client";

import { Button } from "@/shared/components/button";
import { cn } from "@/shared/utils/cn";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";

type ActionButtonVariant = "default" | "concede";

type ActionButtonHandler = () => void | Promise<unknown>;

export function ActionButton({
  active,
  children,
  className,
  disabled = false,
  isShortcutActive = true,
  label,
  onClick,
  shortcut,
  shortcutBadge,
  shortcutLabel,
  showShortcutBadge = Boolean(shortcut),
  variant = "default",
}: {
  active: boolean;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  isShortcutActive?: boolean;
  label: string;
  onClick: ActionButtonHandler;
  shortcut?: string;
  shortcutBadge?: ReactNode;
  shortcutLabel?: string;
  showShortcutBadge?: boolean;
  variant?: ActionButtonVariant;
}) {
  const isActionDisabled = disabled || !onClick;
  const actionLockRef = useRef(false);

  const resolvedShortcut = useMemo(
    () => (shortcut ? normalizeShortcut(shortcut) : null),
    [shortcut],
  );

  const resolvedShortcutLabel =
    shortcutLabel ??
    (resolvedShortcut ? formatShortcut(resolvedShortcut) : null);

  const invokeAction = useCallback(() => {
    if (isActionDisabled || actionLockRef.current) {
      return;
    }

    actionLockRef.current = true;

    try {
      const result = onClick();

      if (isPromiseLike(result)) {
        void result.finally(() => {
          actionLockRef.current = false;
        });

        return;
      }

      actionLockRef.current = false;
    } catch (error) {
      actionLockRef.current = false;
      throw error;
    }
  }, [isActionDisabled, onClick]);

  useEffect(() => {
    if (
      !resolvedShortcut ||
      !isShortcutActive ||
      isActionDisabled ||
      !onClick
    ) {
      return;
    }

    const activeShortcut = resolvedShortcut;

    function handleWindowKeyDown(event: KeyboardEvent) {
      if (shouldIgnoreShortcut(event, activeShortcut)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      invokeAction();
    }

    window.addEventListener("keydown", handleWindowKeyDown, true);

    return () => {
      window.removeEventListener("keydown", handleWindowKeyDown, true);
    };
  }, [
    invokeAction,
    isActionDisabled,
    isShortcutActive,
    onClick,
    resolvedShortcut,
  ]);

  return (
    <Button
      aria-keyshortcuts={
        resolvedShortcut ? toAriaKeyShortcut(resolvedShortcut) : undefined
      }
      aria-label={getAccessibleLabel({
        label,
        shortcutLabel: resolvedShortcutLabel,
      })}
      aria-pressed={active}
      className={cn(
        "group relative flex justify-center items-center p-0 rounded-md size-10 overflow-hidden transition",
        "disabled:cursor-not-allowed disabled:opacity-45",
        "focus-visible:ring-2 focus-visible:ring-ring/50",
        active
          ? "bg-cyan-500 text-white hover:bg-cyan-400"
          : "bg-[#263142] text-slate-100 hover:bg-[#33445a]",
        !active &&
          variant === "concede" &&
          "border border-red-400/30 bg-red-950/70 text-red-100 hover:bg-red-900/80",
        className,
      )}
      disabled={isActionDisabled}
      onClick={invokeAction}
      title={getTitle({
        label,
        shortcutLabel: resolvedShortcutLabel,
      })}
      type="button"
      variant="ghost"
    >
      <span className="z-10 relative flex justify-center items-center">
        {children}
      </span>

      {showShortcutBadge && resolvedShortcut && resolvedShortcutLabel && (
        <span
          aria-hidden="true"
          className={cn(
            "right-0.5 bottom-0.5 z-20 absolute flex justify-center items-center px-0.5 border rounded min-w-3.5",
            "border-white/15 bg-black/20 text-[8px] font-bold leading-3 text-slate-200",
            active && "border-white/25 bg-white/15 text-white",
            variant === "concede" &&
              !active &&
              "border-red-200/20 bg-red-100/10 text-red-100",
          )}
        >
          {shortcutBadge ?? getCompactShortcutBadge(resolvedShortcut)}
        </span>
      )}
    </Button>
  );
}

function shouldIgnoreShortcut(event: KeyboardEvent, shortcut: string) {
  return (
    event.defaultPrevented ||
    event.repeat ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    isEditableShortcutTarget(event.target) ||
    normalizeKeyboardEventKey(event) !== shortcut
  );
}

function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(
    target.closest(
      'input, textarea, select, button, [contenteditable="true"], [role="textbox"]',
    ),
  );
}

function normalizeKeyboardEventKey(event: KeyboardEvent) {
  if (event.code === "Space" || event.key === " " || event.key === "Spacebar") {
    return "space";
  }

  return normalizeShortcut(event.key);
}

function normalizeShortcut(shortcut: string) {
  const normalized = shortcut.trim().toLowerCase();

  if (normalized === "esc") {
    return "escape";
  }

  if (normalized === " " || normalized === "spacebar") {
    return "space";
  }

  return normalized;
}

function formatShortcut(shortcut: string) {
  if (shortcut === "escape") {
    return "Esc";
  }

  if (shortcut === "space") {
    return "Space";
  }

  if (shortcut.length === 1) {
    return shortcut.toUpperCase();
  }

  return shortcut
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function getCompactShortcutBadge(shortcut: string) {
  if (shortcut === "space") {
    return "␣";
  }

  if (shortcut === "escape") {
    return "Esc";
  }

  return formatShortcut(shortcut);
}

function toAriaKeyShortcut(shortcut: string) {
  if (shortcut === "escape") {
    return "Escape";
  }

  if (shortcut === "space") {
    return "Space";
  }

  if (shortcut.length === 1) {
    return shortcut.toUpperCase();
  }

  return shortcut;
}

function getTitle({
  label,
  shortcutLabel,
}: {
  label: string;
  shortcutLabel: string | null;
}) {
  return shortcutLabel ? `${label} · ${shortcutLabel}` : label;
}

function getAccessibleLabel({
  label,
  shortcutLabel,
}: {
  label: string;
  shortcutLabel: string | null;
}) {
  return shortcutLabel ? `${label}. Shortcut: ${shortcutLabel}.` : label;
}

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return Boolean(
    value &&
    typeof value === "object" &&
    "then" in value &&
    typeof value.then === "function",
  );
}
