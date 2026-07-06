"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/shared/components/button";
import { DialogPortal } from "@/shared/components/dialog-portal";

export type CardSelectionPromptOption = {
  description?: string;
  disabled?: boolean;
  id: string;
  imageUrl?: string;
  label: string;
};

export type CardSelectionPromptPresentation = "auto" | "cards" | "list";
export type CardSelectionPromptSelectionMode =
  | "multiple"
  | "ordered"
  | "single";
export type CardSelectionPromptCardSize = "md" | "lg" | "xl";

type ConfirmLabelResolver = string | ((selectedIds: string[]) => string);

export type CardSelectionPromptProps = {
  cancelLabel?: string;
  confirmLabel?: ConfirmLabelResolver;
  cardSize?: CardSelectionPromptCardSize;
  confirmOnSelect?: boolean;
  description?: string;
  initialSelectedIds?: string[];
  isOpen: boolean;
  maxSelected?: number;
  minSelected?: number;
  onCancel?: () => void;
  onConfirm: (selectedIds: string[]) => void;
  options: CardSelectionPromptOption[];
  presentation?: CardSelectionPromptPresentation;
  selectionMode?: CardSelectionPromptSelectionMode;
  title: string;
};

export function CardSelectionPrompt({
  cancelLabel = "Cancel",
  cardSize = "md",
  confirmLabel,
  confirmOnSelect = false,
  description,
  initialSelectedIds,
  isOpen,
  maxSelected,
  minSelected,
  onCancel,
  onConfirm,
  options,
  presentation = "auto",
  selectionMode = "single",
  title,
}: CardSelectionPromptProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [orderedIds, setOrderedIds] = useState<string[]>([]);

  const optionById = useMemo(
    () => new Map(options.map((option) => [option.id, option])),
    [options],
  );

  const enabledOptionIds = useMemo(
    () => options.filter((option) => !option.disabled).map((option) => option.id),
    [options],
  );

  const initialSelectionKey = JSON.stringify(initialSelectedIds ?? []);
  const normalizedInitialSelectedIds = useMemo<string[]>(
    () => JSON.parse(initialSelectionKey) as string[],
    [initialSelectionKey],
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const validInitialIds = normalizedInitialSelectedIds.filter((id) =>
      enabledOptionIds.includes(id),
    );

    if (selectionMode === "ordered") {
      setOrderedIds(validInitialIds.length > 0 ? validInitialIds : enabledOptionIds);
      setSelectedIds([]);
      return;
    }

    setOrderedIds([]);

    if (selectionMode === "single") {
      setSelectedIds(validInitialIds[0] ? [validInitialIds[0]] : []);
      return;
    }

    setSelectedIds(
      maxSelected ? validInitialIds.slice(0, maxSelected) : validInitialIds,
    );
  }, [
    enabledOptionIds,
    isOpen,
    maxSelected,
    normalizedInitialSelectedIds,
    selectionMode,
  ]);

  const usesCardPresentation =
    presentation === "cards" ||
    (presentation === "auto" &&
      options.length > 0 &&
      options.every((option) => Boolean(option.imageUrl)));

  const currentSelectedIds =
    selectionMode === "ordered" ? orderedIds : selectedIds;

  const effectiveMinSelected =
    minSelected ??
    (selectionMode === "multiple" ? 0 : selectionMode === "ordered" ? 1 : 1);

  const canConfirm =
    currentSelectedIds.length >= effectiveMinSelected &&
    (maxSelected === undefined || currentSelectedIds.length <= maxSelected) &&
    currentSelectedIds.every((id) => !optionById.get(id)?.disabled);

  const selectionLimitReached =
    selectionMode === "multiple" &&
    maxSelected !== undefined &&
    selectedIds.length >= maxSelected;

  const selectOption = useCallback(
    (option: CardSelectionPromptOption) => {
      if (option.disabled || selectionMode === "ordered") {
        return;
      }

      if (selectionMode === "single") {
        const nextSelectedIds = [option.id];
        setSelectedIds(nextSelectedIds);

        if (confirmOnSelect) {
          onConfirm(nextSelectedIds);
        }

        return;
      }

      setSelectedIds((currentIds) => {
        if (currentIds.includes(option.id)) {
          return currentIds.filter((id) => id !== option.id);
        }

        if (maxSelected !== undefined && currentIds.length >= maxSelected) {
          return currentIds;
        }

        return [...currentIds, option.id];
      });
    },
    [confirmOnSelect, maxSelected, onConfirm, selectionMode],
  );

  if (!isOpen) {
    return null;
  }

  return (
    <DialogPortal>
      <div className="z-[2147483646] fixed inset-0 flex justify-center items-center bg-black/70 backdrop-blur-sm p-4">
        <section
          aria-modal="true"
          className={cx(
            "relative grid max-h-[min(46rem,calc(100vh-2rem))] w-full gap-4 overflow-hidden rounded-xl border border-cyan-300/25 bg-slate-950/82 p-4 text-slate-100 shadow-2xl shadow-black/80 ring-1 ring-cyan-300/10",
            "supports-backdrop-filter:bg-slate-950/68 supports-backdrop-filter:backdrop-blur-md",
            usesCardPresentation ? getCardDialogMaxWidth(cardSize) : "max-w-xl",
          )}
          role="dialog"
        >
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.10),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.045),transparent_34%)] pointer-events-none"
          />

          <header className="relative space-y-1">
            <h2 className="font-semibold text-slate-50 text-lg leading-tight">
              {title}
            </h2>
            {description && (
              <p className="max-w-2xl text-slate-400 text-sm">{description}</p>
            )}
          </header>

          <div className="relative min-h-0">
            {usesCardPresentation ? (
              <CardChoiceGrid
                cardSize={cardSize}
                maxSelected={maxSelected}
                onOrderChange={setOrderedIds}
                onSelect={selectOption}
                options={
                  selectionMode === "ordered"
                    ? sortOptions(options, orderedIds)
                    : options
                }
                orderedIds={orderedIds}
                selectedIds={currentSelectedIds}
                selectionLimitReached={selectionLimitReached}
                selectionMode={selectionMode}
              />
            ) : selectionMode === "ordered" ? (
              <OrderedChoiceList
                onOrderChange={setOrderedIds}
                options={options}
                orderedIds={orderedIds}
              />
            ) : (
              <ChoiceList
                maxSelected={maxSelected}
                onSelect={selectOption}
                options={options}
                selectedIds={selectedIds}
                selectionLimitReached={selectionLimitReached}
                selectionMode={selectionMode}
              />
            )}
          </div>

          <footer className="relative flex justify-end items-center gap-2 pt-3 border-white/10 border-t">
            <SelectionSummary
              maxSelected={maxSelected}
              selectedIds={currentSelectedIds}
              selectionMode={selectionMode}
            />
            {onCancel && (
              <Button onClick={onCancel} type="button" variant="secondary">
                {cancelLabel}
              </Button>
            )}
            <Button
              disabled={!canConfirm}
              onClick={() => onConfirm(currentSelectedIds)}
              type="button"
            >
              {resolveConfirmLabel({
                confirmLabel,
                selectedIds: currentSelectedIds,
                selectionMode,
              })}
            </Button>
          </footer>
        </section>
      </div>
    </DialogPortal>
  );
}

function CardChoiceGrid({
  cardSize,
  maxSelected,
  onOrderChange,
  onSelect,
  options,
  orderedIds,
  selectedIds,
  selectionLimitReached,
  selectionMode,
}: {
  cardSize: CardSelectionPromptCardSize;
  maxSelected?: number;
  onOrderChange: (ids: string[]) => void;
  onSelect: (option: CardSelectionPromptOption) => void;
  options: CardSelectionPromptOption[];
  orderedIds: string[];
  selectedIds: string[];
  selectionLimitReached: boolean;
  selectionMode: CardSelectionPromptSelectionMode;
}) {
  const compactGrid = options.length > 3;
  const gridColumnClass = getCardGridColumnClass(cardSize);
  const cardWidthClass = getCardChoiceWidthClass(cardSize);
  const imageHeightClass = getCardChoiceImageHeightClass(cardSize);
  const shouldReserveLimitMessageSpace =
    selectionMode === "multiple" && maxSelected !== undefined;

  return (
    <div
      className={cx(
        "max-h-[min(37rem,calc(100vh-12rem))] overflow-auto px-2 pt-2 pb-1",
        compactGrid
          ? `grid ${gridColumnClass} gap-3`
          : "flex flex-wrap justify-center gap-5",
      )}
    >
      {options.map((option) => {
        const selectedIndex = selectedIds.indexOf(option.id);
        const isSelected = selectedIndex >= 0;
        const disabledByLimit =
          selectionMode === "multiple" && !isSelected && selectionLimitReached;
        const disabled = Boolean(option.disabled || disabledByLimit);

        return (
          <div
            className={cx("min-w-0", compactGrid ? "" : cardWidthClass)}
            key={option.id}
          >
            <button
              aria-label={option.label}
              aria-pressed={selectionMode === "ordered" ? undefined : isSelected}
              className={cx(
                "group relative block w-full overflow-visible rounded-xl border bg-white/[0.045] p-1.5 text-left shadow-lg shadow-black/30 outline-none ring-1 ring-white/[0.035] transition",
                "supports-backdrop-filter:bg-white/[0.035] supports-backdrop-filter:backdrop-blur-sm",
                "enabled:hover:border-cyan-300/55 enabled:hover:bg-cyan-300/[0.055] enabled:focus-visible:border-cyan-300 enabled:focus-visible:ring-2 enabled:focus-visible:ring-inset enabled:focus-visible:ring-cyan-300/60",
                isSelected
                  ? "border-cyan-300 bg-cyan-300/[0.07] ring-2 ring-inset ring-cyan-300/65 shadow-cyan-300/10"
                  : "border-white/10",
                disabled && "cursor-not-allowed opacity-40 grayscale",
              )}
              data-selected={isSelected ? "true" : "false"}
              disabled={disabled || selectionMode === "ordered"}
              onClick={() => onSelect(option)}
              type="button"
            >
              {option.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- Choice cards may use catalog or local card assets.
                <img
                  alt={option.label}
                  className={cx(
                    "block w-full rounded-lg object-contain shadow-xl shadow-black/60 transition group-hover:scale-[1.015] group-disabled:scale-100",
                    imageHeightClass,
                  )}
                  src={option.imageUrl}
                />
              ) : (
                <span className="flex justify-center items-center bg-slate-900/80 p-3 border border-white/10 rounded-lg aspect-[130/181] font-semibold text-slate-200 text-sm text-center">
                  {option.label}
                </span>
              )}

              {isSelected && (
                <span className="top-2 right-2 absolute flex justify-center items-center bg-cyan-300 shadow-black/40 shadow-lg border border-cyan-100/60 rounded-full size-7 font-black text-slate-950 text-xs">
                  {selectionMode === "ordered" ? selectedIndex + 1 : "✓"}
                </span>
              )}
            </button>

            {selectionMode === "ordered" && (
              <div className="flex justify-center gap-1 mt-2">
                <ReorderButton
                  disabled={selectedIndex <= 0}
                  label={`Move ${option.label} up`}
                  onClick={() =>
                    onOrderChange(moveItem(orderedIds, selectedIndex, -1))
                  }
                >
                  Up
                </ReorderButton>
                <ReorderButton
                  disabled={selectedIndex === orderedIds.length - 1}
                  label={`Move ${option.label} down`}
                  onClick={() =>
                    onOrderChange(moveItem(orderedIds, selectedIndex, 1))
                  }
                >
                  Down
                </ReorderButton>
              </div>
            )}

            {shouldReserveLimitMessageSpace && (
              <p
                aria-hidden={!disabledByLimit}
                className={cx(
                  "mt-1 min-h-4 text-center text-[11px] leading-4 transition-opacity",
                  disabledByLimit ? "text-slate-400 opacity-100" : "opacity-0",
                )}
              >
                Select up to {maxSelected}.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ChoiceList({
  maxSelected,
  onSelect,
  options,
  selectedIds,
  selectionLimitReached,
  selectionMode,
}: {
  maxSelected?: number;
  onSelect: (option: CardSelectionPromptOption) => void;
  options: CardSelectionPromptOption[];
  selectedIds: string[];
  selectionLimitReached: boolean;
  selectionMode: Exclude<CardSelectionPromptSelectionMode, "ordered">;
}) {
  return (
    <div className="gap-2 grid pr-1 max-h-[28rem] overflow-auto">
      {options.map((option) => {
        const isSelected = selectedIds.includes(option.id);
        const disabledByLimit =
          selectionMode === "multiple" && !isSelected && selectionLimitReached;
        const disabled = Boolean(option.disabled || disabledByLimit);

        return (
          <button
            aria-pressed={isSelected}
            className={cx(
              "flex min-h-16 items-center gap-3 rounded-lg border bg-white/[0.045] p-2 text-left shadow-sm shadow-black/20 transition disabled:cursor-not-allowed disabled:opacity-45",
              isSelected
                ? "border-cyan-300 bg-cyan-300/15 ring-1 ring-cyan-300/50"
                : "border-white/10 hover:border-cyan-300/40 hover:bg-cyan-300/[0.04]",
            )}
            disabled={disabled}
            key={option.id}
            onClick={() => onSelect(option)}
            type="button"
          >
            <OptionImage option={option} />
            <OptionText option={option} />
            {selectionMode === "multiple" && maxSelected !== undefined && (
              <span className="ml-auto text-slate-500 text-xs">
                {isSelected ? "Selected" : `Max ${maxSelected}`}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function OrderedChoiceList({
  onOrderChange,
  options,
  orderedIds,
}: {
  onOrderChange: (ids: string[]) => void;
  options: CardSelectionPromptOption[];
  orderedIds: string[];
}) {
  const optionById = new Map(options.map((option) => [option.id, option]));

  return (
    <ol className="gap-2 grid pr-1 max-h-[28rem] overflow-auto">
      {orderedIds.map((id, index) => {
        const option = optionById.get(id);

        if (!option) {
          return null;
        }

        return (
          <li
            className="flex items-center gap-3 bg-white/[0.045] shadow-black/20 shadow-sm p-2 border border-white/10 rounded-lg min-h-16"
            key={id}
          >
            <span className="flex justify-center items-center bg-slate-950/60 border border-white/10 rounded-md size-7 font-semibold text-slate-300 text-xs shrink-0">
              {index + 1}
            </span>
            <OptionImage option={option} />
            <OptionText option={option} />
            <div className="flex gap-1 ml-auto">
              <ReorderButton
                disabled={index === 0}
                label="Move up"
                onClick={() => onOrderChange(moveItem(orderedIds, index, -1))}
              >
                Up
              </ReorderButton>
              <ReorderButton
                disabled={index === orderedIds.length - 1}
                label="Move down"
                onClick={() => onOrderChange(moveItem(orderedIds, index, 1))}
              >
                Down
              </ReorderButton>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function OptionImage({ option }: { option: CardSelectionPromptOption }) {
  if (!option.imageUrl) {
    return null;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- Choice options may use catalog or local card assets.
    <img
      alt=""
      className="border border-white/10 rounded w-12 h-16 object-cover shrink-0"
      src={option.imageUrl}
    />
  );
}

function OptionText({ option }: { option: CardSelectionPromptOption }) {
  return (
    <span className="min-w-0">
      <span className="block font-semibold text-slate-100 text-sm truncate">
        {option.label}
      </span>
      {option.description && (
        <span className="block mt-0.5 text-slate-400 text-xs">
          {option.description}
        </span>
      )}
    </span>
  );
}

function SelectionSummary({
  maxSelected,
  selectedIds,
  selectionMode,
}: {
  maxSelected?: number;
  selectedIds: string[];
  selectionMode: CardSelectionPromptSelectionMode;
}) {
  if (selectionMode !== "multiple" || maxSelected === undefined) {
    return null;
  }

  return (
    <span className="mr-auto text-slate-500 text-xs">
      {selectedIds.length}/{maxSelected} selected
    </span>
  );
}

function getCardDialogMaxWidth(cardSize: CardSelectionPromptCardSize) {
  switch (cardSize) {
    case "xl":
      return "max-w-7xl";
    case "lg":
      return "max-w-6xl";
    case "md":
    default:
      return "max-w-5xl";
  }
}

function getCardGridColumnClass(cardSize: CardSelectionPromptCardSize) {
  switch (cardSize) {
    case "xl":
      return "grid-cols-[repeat(auto-fit,minmax(13rem,1fr))]";
    case "lg":
      return "grid-cols-[repeat(auto-fit,minmax(11rem,1fr))]";
    case "md":
    default:
      return "grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))]";
  }
}

function getCardChoiceWidthClass(cardSize: CardSelectionPromptCardSize) {
  switch (cardSize) {
    case "xl":
      return "w-[min(23rem,calc(100vw-3rem))]";
    case "lg":
      return "w-[min(20rem,calc(100vw-3rem))]";
    case "md":
    default:
      return "w-[min(16rem,calc(100vw-3rem))]";
  }
}

function getCardChoiceImageHeightClass(cardSize: CardSelectionPromptCardSize) {
  switch (cardSize) {
    case "xl":
      return "max-h-[min(34rem,62vh)]";
    case "lg":
      return "max-h-[min(30rem,58vh)]";
    case "md":
    default:
      return "max-h-[min(25rem,55vh)]";
  }
}

function ReorderButton({
  children,
  disabled,
  label,
  onClick,
}: {
  children: string;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      aria-label={label}
      className="bg-slate-950/45 disabled:opacity-35 px-2 border border-white/10 enabled:hover:border-cyan-300/40 h-8 text-[11px] text-slate-300 enabled:hover:text-white disabled:cursor-not-allowed"
      disabled={disabled}
      onClick={onClick}
      type="button"
      variant="secondary"
    >
      {children}
    </Button>
  );
}

function resolveConfirmLabel({
  confirmLabel,
  selectedIds,
  selectionMode,
}: {
  confirmLabel?: ConfirmLabelResolver;
  selectedIds: string[];
  selectionMode: CardSelectionPromptSelectionMode;
}) {
  if (typeof confirmLabel === "function") {
    return confirmLabel(selectedIds);
  }

  if (confirmLabel) {
    return confirmLabel;
  }

  if (selectionMode === "ordered") {
    return "Submit order";
  }

  if (selectionMode === "multiple") {
    return selectedIds.length > 0 ? "Confirm selection" : "Confirm";
  }

  return "Confirm";
}

function sortOptions(
  options: CardSelectionPromptOption[],
  orderedIds: string[],
) {
  const optionById = new Map(options.map((option) => [option.id, option]));

  return orderedIds
    .map((id) => optionById.get(id))
    .filter((option): option is CardSelectionPromptOption => Boolean(option));
}

function moveItem(items: string[], index: number, direction: -1 | 1) {
  const nextIndex = index + direction;

  if (nextIndex < 0 || nextIndex >= items.length) {
    return items;
  }

  const next = [...items];
  const [item] = next.splice(index, 1);

  if (!item) {
    return items;
  }

  next.splice(nextIndex, 0, item);

  return next;
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}
