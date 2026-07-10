"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { ChevronDown, Info } from "lucide-react";
import {
  type ComponentPropsWithoutRef,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";

import { Button } from "@/shared/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/dropdown-menu";
import { Kbd } from "@/shared/components/kbd";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/shared/components/tooltip";
import { cn } from "@/shared/utils/cn";

export type GameActionSlot =
  | "primary"
  | "secondary"
  | "tertiary"
  | "quaternary"
  | "cancel";

export const DEFAULT_GAME_ACTION_KEYBINDS = {
  primary: "q",
  secondary: "w",
  tertiary: "e",
  quaternary: "r",
  cancel: "escape",
} as const satisfies Record<GameActionSlot, string>;

const gameActionButtonVariants = cva(["min-w-0 font-semibold leading-none"], {
  variants: {
    variant: {
      default: "shadow-[0_0_20px_var(--action-glow)]",
      secondary: "",
      outline: "border-action-border",
      ghost: "",
      destructive: "shadow-[0_0_20px_var(--destructive-glow)]",
    },
    size: {
      compact: "h-8 px-2.5",
      default: "h-9 px-3",
      lg: "h-10 px-4",
    },
    shape: {
      default: "",
      splitPrimary: "rounded-r-none",
      splitTrigger: "w-9 rounded-l-none px-0",
    },
    fullWidth: {
      true: "w-full",
      false: "",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "default",
    shape: "default",
    fullWidth: false,
  },
});

const gameActionLabelVariants = cva(
  "min-w-0 font-semibold truncate leading-[1.25]",
  {
    variants: {
      size: {
        compact: "text-[11px]",
        default: "text-[12px]",
        lg: "text-[13px]",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

const gameActionKeybindVariants = cva(
  [
    "shrink-0 rounded border px-1.5 py-0.5",
    "text-[10px] font-semibold leading-[1.2] shadow-none",
  ],
  {
    variants: {
      tone: {
        default: ["border-primary/25", "bg-primary/15", "text-primary"],
        inverse: [
          "border-primary-foreground/20",
          "bg-primary-foreground/10",
          "text-primary-foreground/80",
        ],
        destructive: [
          "border-destructive-foreground/20",
          "bg-destructive-foreground/15",
          "text-destructive-foreground",
        ],
      },
    },
    defaultVariants: {
      tone: "default",
    },
  },
);

const gameActionHelpButtonVariants = cva(
  [
    "inline-flex shrink-0 cursor-pointer items-center justify-center",
    "rounded-md border border-action-border/60",
    "bg-secondary text-secondary-foreground/70",
    "transition-[background-color,border-color,color,box-shadow,transform]",
    "hover:border-action-border",
    "hover:bg-accent hover:text-accent-foreground",
    "focus-visible:outline-none",
    "focus-visible:ring-2 focus-visible:ring-ring/50",
    "active:translate-y-px",
  ],
  {
    variants: {
      size: {
        compact: "h-7 w-7",
        default: "h-7 w-7",
        lg: "h-8 w-8",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

type ButtonProps = ComponentPropsWithoutRef<typeof Button>;

type GameActionButtonVariant = NonNullable<
  VariantProps<typeof gameActionButtonVariants>["variant"]
>;

type GameActionButtonSize = NonNullable<
  VariantProps<typeof gameActionButtonVariants>["size"]
>;

type GameActionButtonShape = NonNullable<
  VariantProps<typeof gameActionButtonVariants>["shape"]
>;

type GameActionButtonVisualProps = {
  fullWidth?: boolean;
  shape?: GameActionButtonShape;
  size?: GameActionButtonSize;
  variant?: GameActionButtonVariant;
};

type GameActionKeybindTone = NonNullable<
  VariantProps<typeof gameActionKeybindVariants>["tone"]
>;

type GameActionHandler = () => void | Promise<unknown>;

type GameActionKeybinds = Partial<Record<GameActionSlot, string>>;

type GameActionShortcutOptions = {
  actionSlot: GameActionSlot;
  disabled?: boolean;
  isActive?: boolean;
  keyboardEnabled?: boolean;
  keybinds?: GameActionKeybinds;
  onAction?: GameActionHandler;
  preventDefault?: boolean;
  stopPropagation?: boolean;
};

export type GameActionButtonProps = Omit<
  ButtonProps,
  "fullWidth" | "onClick" | "size" | "variant"
> &
  GameActionButtonVisualProps & {
    actionSlot: GameActionSlot;
    children: ReactNode;
    helpLabel?: string;
    helpText?: ReactNode;
    isActive?: boolean;
    isBusy?: boolean;
    keyboardEnabled?: boolean;
    keybindClassName?: string;
    keybinds?: GameActionKeybinds;
    keybindTone?: GameActionKeybindTone;
    onAction?: GameActionHandler;
    showKeybind?: boolean;
  };

export type GameActionMenuAction = {
  actionSlot: GameActionSlot;
  disabled?: boolean;
  id?: string;
  isBusy?: boolean;
  keybindClassName?: string;
  keybindTone?: GameActionKeybindTone;
  label: ReactNode;
  onAction?: GameActionHandler;
};

export type GameActionSplitButtonProps = {
  align?: "start" | "center" | "end";
  className?: string;
  disabled?: boolean;
  fullWidth?: boolean;
  helpLabel?: string;
  helpText?: ReactNode;
  isActive?: boolean;
  isBusy?: boolean;
  keyboardEnabled?: boolean;
  keybinds?: GameActionKeybinds;
  keybindTone?: GameActionKeybindTone;
  menuLabel?: string;
  primaryAction: GameActionMenuAction;
  secondaryActions: GameActionMenuAction[];
  showKeybind?: boolean;
  sideOffset?: number;
  size?: GameActionButtonSize;
  variant?: GameActionButtonVariant;
};

export function GameActionButton({
  actionSlot,
  children,
  className,
  disabled = false,
  fullWidth = false,
  helpLabel,
  helpText,
  isActive = true,
  isBusy = false,
  keyboardEnabled = true,
  keybindClassName,
  keybinds,
  keybindTone,
  onAction,
  shape = "default",
  showKeybind = true,
  size = "default",
  type = "button",
  variant = "default",
  ...props
}: GameActionButtonProps) {
  const isActionDisabled = disabled || isBusy || !onAction;

  const invokeAction = useGameActionInvoker({
    disabled: isActionDisabled,
    onAction,
  });

  const keybind = useGameActionShortcut({
    actionSlot,
    disabled: isActionDisabled,
    isActive,
    keyboardEnabled,
    keybinds,
    onAction: invokeAction,
  });

  const resolvedVariant = variant ?? "default";

  const resolvedKeybindTone =
    keybindTone ?? getDefaultKeybindTone(resolvedVariant);

  const handleClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      if (isActionDisabled) {
        event.preventDefault();
        return;
      }

      invokeAction();
    },
    [invokeAction, isActionDisabled],
  );

  const button = (
    <Button
      aria-busy={isBusy || undefined}
      aria-keyshortcuts={keybind ? toAriaKeyShortcut(keybind) : undefined}
      className={cn(
        gameActionButtonVariants({
          fullWidth,
          shape,
          size,
          variant: resolvedVariant,
        }),
        className,
      )}
      disabled={isActionDisabled}
      fullWidth={fullWidth}
      onClick={handleClick}
      size={getBaseButtonSize(size)}
      type={type}
      variant={variant}
      {...props}
    >
      <span className={gameActionLabelVariants({ size })}>{children}</span>

      {showKeybind && keybind && (
        <GameActionKeybindHint
          className={keybindClassName}
          keybind={keybind}
          tone={resolvedKeybindTone}
        />
      )}
    </Button>
  );

  if (!helpText) {
    return button;
  }

  return (
    <GameActionHelpWrapper
      fullWidth={fullWidth}
      helpLabel={helpLabel}
      helpText={helpText}
      size={size}
    >
      {button}
    </GameActionHelpWrapper>
  );
}

export function GameActionSplitButton({
  align = "end",
  className,
  disabled = false,
  fullWidth = false,
  helpLabel,
  helpText,
  isActive = true,
  isBusy = false,
  keyboardEnabled = true,
  keybinds,
  keybindTone,
  menuLabel = "More actions",
  primaryAction,
  secondaryActions,
  showKeybind = true,
  sideOffset = 6,
  size = "default",
  variant = "default",
}: GameActionSplitButtonProps) {
  const hasSecondaryActions = secondaryActions.length > 0;

  const isPrimaryDisabled =
    disabled || isBusy || primaryAction.disabled || primaryAction.isBusy;

  const resolvedKeybindTone = keybindTone ?? getDefaultKeybindTone(variant);

  const splitButton = (
    <DropdownMenu>
      <div
        className={cn(
          "inline-flex items-center min-w-0",
          fullWidth && "w-full",
          className,
        )}
      >
        <GameActionButton
          actionSlot={primaryAction.actionSlot}
          className="min-w-0"
          disabled={isPrimaryDisabled}
          fullWidth={fullWidth}
          isActive={isActive}
          isBusy={isBusy || primaryAction.isBusy}
          keyboardEnabled={keyboardEnabled}
          keybindClassName={primaryAction.keybindClassName}
          keybinds={keybinds}
          keybindTone={primaryAction.keybindTone ?? resolvedKeybindTone}
          onAction={primaryAction.onAction}
          shape={hasSecondaryActions ? "splitPrimary" : "default"}
          showKeybind={showKeybind}
          size={size}
          variant={variant}
        >
          {primaryAction.label}
        </GameActionButton>

        {hasSecondaryActions && (
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={menuLabel}
              className={cn(
                gameActionButtonVariants({
                  shape: "splitTrigger",
                  size,
                  variant,
                }),
                "border-l border-primary-foreground/15",
              )}
              disabled={disabled || isBusy}
              size={getBaseButtonSize(size)}
              type="button"
              variant={variant}
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
        )}
      </div>

      {hasSecondaryActions && (
        <DropdownMenuContent
          align={align}
          className={cn(
            "z-100 min-w-52",
            "border border-border",
            "bg-popover text-popover-foreground",
            "shadow-xl shadow-black/40",
            "backdrop-blur-xl",
          )}
          sideOffset={sideOffset}
        >
          {secondaryActions.map((action, index) => (
            <GameActionDropdownItem
              action={action}
              disabled={disabled || isBusy}
              isActive={isActive}
              key={action.id ?? `${action.actionSlot}-${index}`}
              keyboardEnabled={keyboardEnabled}
              keybinds={keybinds}
              keybindTone={action.keybindTone ?? "default"}
              showKeybind={showKeybind}
            />
          ))}
        </DropdownMenuContent>
      )}
    </DropdownMenu>
  );

  if (!helpText) {
    return splitButton;
  }

  return (
    <GameActionHelpWrapper
      fullWidth={fullWidth}
      helpLabel={helpLabel}
      helpText={helpText}
      size={size}
    >
      {splitButton}
    </GameActionHelpWrapper>
  );
}

function GameActionDropdownItem({
  action,
  disabled,
  isActive,
  keyboardEnabled,
  keybinds,
  keybindTone,
  showKeybind,
}: {
  action: GameActionMenuAction;
  disabled: boolean;
  isActive: boolean;
  keyboardEnabled: boolean;
  keybinds?: GameActionKeybinds;
  keybindTone: GameActionKeybindTone;
  showKeybind: boolean;
}) {
  const isActionDisabled =
    disabled || action.disabled || action.isBusy || !action.onAction;

  const invokeAction = useGameActionInvoker({
    disabled: isActionDisabled,
    onAction: action.onAction,
  });

  const keybind = useGameActionShortcut({
    actionSlot: action.actionSlot,
    disabled: isActionDisabled,
    isActive,
    keyboardEnabled,
    keybinds,
    onAction: invokeAction,
  });

  return (
    <DropdownMenuItem
      className={cn(
        "flex items-center gap-3 px-2 py-2 rounded-md cursor-pointer",
        "focus:bg-accent focus:text-accent-foreground",
        "data-disabled:cursor-not-allowed",
        "data-disabled:opacity-50",
      )}
      disabled={isActionDisabled}
      onSelect={(event) => {
        if (isActionDisabled) {
          event.preventDefault();
          return;
        }

        invokeAction();
      }}
    >
      <span className="flex-1 min-w-0 font-semibold text-[12px] truncate leading-tight">
        {action.label}
      </span>

      {showKeybind && keybind && (
        <GameActionKeybindHint
          className={cn("ml-4", action.keybindClassName)}
          keybind={keybind}
          tone={keybindTone}
        />
      )}
    </DropdownMenuItem>
  );
}

function GameActionHelpWrapper({
  children,
  fullWidth,
  helpLabel,
  helpText,
  size,
}: {
  children: ReactNode;
  fullWidth: boolean;
  helpLabel?: string;
  helpText: ReactNode;
  size: GameActionButtonSize;
}) {
  return (
    <TooltipProvider delayDuration={150}>
      <div
        className={cn(
          "inline-flex items-center gap-1.5 min-w-0",
          fullWidth && "w-full",
        )}
      >
        {children}

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              aria-label={helpLabel ?? "Action help"}
              className={gameActionHelpButtonVariants({ size })}
              type="button"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
          </TooltipTrigger>

          <TooltipContent
            align="start"
            className={cn(
              "z-100 max-w-64",
              "border border-border",
              "bg-popover px-3 py-2",
              "text-xs leading-snug text-popover-foreground",
              "shadow-xl shadow-black/40",
            )}
            side="bottom"
            sideOffset={8}
          >
            {helpText}
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}

function GameActionKeybindHint({
  className,
  keybind,
  tone,
}: {
  className?: string;
  keybind: string;
  tone: GameActionKeybindTone;
}) {
  return (
    <Kbd className={cn(gameActionKeybindVariants({ tone }), className)}>
      {formatKeybind(keybind)}
    </Kbd>
  );
}

function useGameActionInvoker({
  disabled,
  onAction,
}: {
  disabled: boolean;
  onAction?: GameActionHandler;
}) {
  const actionLockRef = useRef(false);

  return useCallback(() => {
    if (disabled || !onAction || actionLockRef.current) {
      return;
    }

    actionLockRef.current = true;

    try {
      const result = onAction();

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
  }, [disabled, onAction]);
}

function useGameActionShortcut({
  actionSlot,
  disabled = false,
  isActive = true,
  keyboardEnabled = true,
  keybinds,
  onAction,
  preventDefault = true,
  stopPropagation = true,
}: GameActionShortcutOptions) {
  const onActionRef = useRef(onAction);

  useEffect(() => {
    onActionRef.current = onAction;
  }, [onAction]);

  const keybind = useMemo(
    () => resolveGameActionKeybind(actionSlot, keybinds),
    [actionSlot, keybinds],
  );

  useEffect(() => {
    if (!keyboardEnabled || !isActive || disabled || !keybind || !onAction) {
      return;
    }

    function handleWindowKeyDown(event: KeyboardEvent) {
      if (shouldIgnoreGameActionShortcut(event, keybind)) {
        return;
      }

      if (preventDefault) {
        event.preventDefault();
      }

      if (stopPropagation) {
        event.stopPropagation();
      }

      onActionRef.current?.();
    }

    window.addEventListener("keydown", handleWindowKeyDown, true);

    return () => {
      window.removeEventListener("keydown", handleWindowKeyDown, true);
    };
  }, [
    disabled,
    isActive,
    keyboardEnabled,
    keybind,
    onAction,
    preventDefault,
    stopPropagation,
  ]);

  return keybind;
}

function getBaseButtonSize(
  size: GameActionButtonSize,
): NonNullable<ButtonProps["size"]> {
  if (size === "compact") {
    return "sm";
  }

  return size;
}

function resolveGameActionKeybind(
  actionSlot: GameActionSlot,
  keybinds?: GameActionKeybinds,
) {
  return keybinds?.[actionSlot] ?? DEFAULT_GAME_ACTION_KEYBINDS[actionSlot];
}

function shouldIgnoreGameActionShortcut(event: KeyboardEvent, keybind: string) {
  return (
    event.defaultPrevented ||
    event.repeat ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    isEditableTarget(event.target) ||
    normalizeKeyboardKey(event.key) !== normalizeKeybind(keybind)
  );
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable="true"], [role="textbox"]',
    ),
  );
}

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return Boolean(
    value &&
    typeof value === "object" &&
    "then" in value &&
    typeof value.then === "function",
  );
}

function getDefaultKeybindTone(
  variant: GameActionButtonVariant,
): GameActionKeybindTone {
  if (variant === "default") {
    return "inverse";
  }

  if (variant === "destructive") {
    return "destructive";
  }

  return "default";
}

function normalizeKeyboardKey(key: string) {
  return normalizeKeybind(key);
}

function normalizeKeybind(keybind: string) {
  const normalized = keybind.trim().toLowerCase();

  if (normalized === "esc") {
    return "escape";
  }

  if (normalized === "spacebar") {
    return " ";
  }

  return normalized;
}

function formatKeybind(keybind: string) {
  const normalized = normalizeKeybind(keybind);

  if (normalized === "escape") {
    return "Esc";
  }

  if (normalized === " ") {
    return "Space";
  }

  if (normalized.length === 1) {
    return normalized.toUpperCase();
  }

  return normalized
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function toAriaKeyShortcut(keybind: string) {
  const normalized = normalizeKeybind(keybind);

  if (normalized === "escape") {
    return "Escape";
  }

  if (normalized === " ") {
    return "Space";
  }

  if (normalized.length === 1) {
    return normalized.toUpperCase();
  }

  return normalized;
}
