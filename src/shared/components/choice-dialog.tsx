"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "./button";
import { DialogPortal } from "./dialog-portal";
import { cn } from "@/shared/utils/cn";
import { GameActionButton } from "@/features/game-board/components/game-action-button";

export type ChoiceDialogOption = {
  description?: string;
  disabled?: boolean;
  id: string;
  imageOrientation?: "auto" | "portrait" | "landscape";
  imageUrl?: string;
  label: string;
};

export type ChoiceDialogProps = {
  headerAction?: ReactNode;
  interactionSuspended?: boolean;
  isVisible?: boolean;
  confirmLabel?: string;
  decisionKey?: string;
  description?: string;
  isOpen: boolean;
  isSubmitting?: boolean;
  onCancel?: () => void;
  onConfirm: (selectedIds: string[]) => void;
  options: ChoiceDialogOption[];
  selectionMode: "ordered" | "single";
  title: string;
};

export function ChoiceDialog({
  confirmLabel,
  headerAction,
  interactionSuspended = false,
  isVisible = true,
  decisionKey,
  description,
  isOpen,
  isSubmitting = false,
  onCancel,
  onConfirm,
  options,
  selectionMode,
  title,
}: ChoiceDialogProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const optionIds = options.map((option) => option.id);
  const choiceDecisionKey =
    decisionKey ??
    JSON.stringify([
      title,
      selectionMode,
      selectionMode === "ordered" ? optionIds : [...optionIds].sort(),
    ]);
  const optionIdsRef = useRef(optionIds);
  optionIdsRef.current = optionIds;

  useEffect(() => {
    setSelectedId(null);
    setOrderedIds(optionIdsRef.current);
  }, [choiceDecisionKey, isOpen]);

  if (!isOpen) {
    return null;
  }

  const canConfirm =
    selectionMode === "ordered"
      ? orderedIds.length > 0
      : selectedId !== null &&
        !options.find((option) => option.id === selectedId)?.disabled;
  const selectedIds =
    selectionMode === "ordered" ? orderedIds : selectedId ? [selectedId] : [];

  return (
    <DialogPortal>
      <div
        aria-hidden={!isVisible || undefined}
        className={cn(
          "z-[2147483646] fixed inset-0 flex justify-center items-center bg-black/70 backdrop-blur-sm p-4 text-slate-100",
          !isVisible && "invisible pointer-events-none",
        )}
      >
        <section
          aria-modal={isVisible ? "true" : undefined}
          className={cn(
            "gap-4 grid rounded-xl w-full max-w-2xl max-h-[min(42rem,calc(100vh-2rem))] overflow-hidden",
            "border border-cyan-300/25 bg-slate-950/82 p-4 shadow-2xl shadow-black/80 ring-1 ring-cyan-300/10",
            "supports-backdrop-filter:bg-slate-950/68 supports-backdrop-filter:backdrop-blur-md",
          )}
          role="dialog"
        >
          <header className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <h2 className="font-semibold text-slate-50 text-lg leading-tight">
                {title}
              </h2>
              {description && (
                <p className="text-slate-400 text-sm leading-5">{description}</p>
              )}
            </div>
            {headerAction}
          </header>

          {selectionMode === "single" ? (
            <SingleChoiceList
              interactionSuspended={interactionSuspended}
              onSelect={setSelectedId}
              options={options}
              selectedId={selectedId}
            />
          ) : (
            <OrderedChoiceList
              interactionSuspended={interactionSuspended}
              onOrderChange={setOrderedIds}
              options={options}
              orderedIds={orderedIds}
            />
          )}

          <footer className="flex justify-end gap-2 pt-3 border-white/10 border-t">
            {onCancel && (
              <Button
                disabled={interactionSuspended}
                onClick={onCancel}
                type="button"
                variant="secondary"
              >
                Cancel
              </Button>
            )}

            <GameActionButton
              actionSlot="primary"
              disabled={interactionSuspended || !canConfirm}
              isBusy={isSubmitting}
              onAction={() => onConfirm(selectedIds)}
            >
              {isSubmitting ? "Submitting…" : confirmLabel}
            </GameActionButton>
          </footer>
        </section>
      </div>
    </DialogPortal>
  );
}

function SingleChoiceList({
  interactionSuspended,
  onSelect,
  options,
  selectedId,
}: {
  interactionSuspended: boolean;
  onSelect: (id: string) => void;
  options: ChoiceDialogOption[];
  selectedId: string | null;
}) {
  return (
    <div className="gap-2 grid pr-1 max-h-112 overflow-auto">
      {options.map((option) => {
        const isSelected = selectedId === option.id;

        return (
          <button
            className={cn(
              "flex items-center gap-3 p-2 border rounded-lg min-h-16 text-left transition",
              "bg-white/5.5 shadow-sm shadow-black/20",
              "disabled:cursor-not-allowed disabled:opacity-45",
              isSelected
                ? "border-cyan-300/80 bg-cyan-300/12 shadow-[0_0_18px_rgba(34,211,238,0.12)]"
                : "border-white/10 hover:border-cyan-300/45 hover:bg-cyan-300/5.5",
            )}
            disabled={interactionSuspended || option.disabled}
            key={option.id}
            onClick={() => onSelect(option.id)}
            type="button"
          >
            <OptionImage option={option} />
            <OptionText option={option} />
          </button>
        );
      })}
    </div>
  );
}

function OrderedChoiceList({
  interactionSuspended,
  onOrderChange,
  options,
  orderedIds,
}: {
  interactionSuspended: boolean;
  onOrderChange: (ids: string[]) => void;
  options: ChoiceDialogOption[];
  orderedIds: string[];
}) {
  const optionById = new Map(options.map((option) => [option.id, option]));

  return (
    <ol className="gap-2 grid pr-1 max-h-112 overflow-auto">
      {orderedIds.map((id, index) => {
        const option = optionById.get(id);

        if (!option) {
          return null;
        }

        return (
          <li
            className={cn(
              "items-center gap-3 grid grid-cols-[auto_auto_minmax(0,1fr)_auto] p-2 border rounded-lg min-h-20",
              "border-white/10 bg-white/5.5 shadow-sm shadow-black/25",
            )}
            key={id}
          >
            <span className="flex justify-center items-center bg-slate-800/80 shadow-black/20 shadow-inner border border-white/10 rounded-md size-8 font-mono font-semibold text-slate-200 text-xs shrink-0">
              {index + 1}
            </span>
            <OptionImage option={option} />
            <OptionText option={option} />
            <div className="flex gap-1.5 ml-auto">
              <ReorderButton
                disabled={interactionSuspended || index === 0}
                label="Move up"
                onClick={() => onOrderChange(moveItem(orderedIds, index, -1))}
              >
                Up
              </ReorderButton>
              <ReorderButton
                disabled={interactionSuspended || index === orderedIds.length - 1}
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

function OptionImage({ option }: { option: ChoiceDialogOption }) {
  const [detectedOrientation, setDetectedOrientation] = useState<
    "portrait" | "landscape" | null
  >(null);

  if (!option.imageUrl) {
    return null;
  }

  const orientation =
    option.imageOrientation && option.imageOrientation !== "auto"
      ? option.imageOrientation
      : (detectedOrientation ?? "portrait");

  return (
    <span
      className={cn(
        "flex justify-center items-center bg-black/25 shadow-black/30 shadow-md border border-white/10 rounded-md overflow-hidden shrink-0",
        orientation === "landscape" ? "h-16 w-28" : "h-16 w-12",
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- Choice options may use catalog or local card assets. */}
      <img
        alt=""
        className="block w-full h-full object-contain"
        draggable={false}
        onLoad={(event) => {
          if (option.imageOrientation && option.imageOrientation !== "auto") {
            return;
          }

          const image = event.currentTarget;
          const isLandscape = image.naturalWidth > image.naturalHeight * 1.05;

          setDetectedOrientation(isLandscape ? "landscape" : "portrait");
        }}
        src={option.imageUrl}
      />
    </span>
  );
}

function OptionText({ option }: { option: ChoiceDialogOption }) {
  return (
    <span className="min-w-0">
      <span className="block font-semibold text-slate-100 text-sm truncate">
        {option.label}
      </span>
      {option.description && (
        <span className="block mt-0.5 text-slate-400 text-xs line-clamp-2 leading-5">
          {option.description}
        </span>
      )}
    </span>
  );
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
      className="bg-white/5 hover:bg-cyan-300/10 disabled:opacity-35 px-2.5 border-white/10 hover:border-cyan-300/40 h-8 text-slate-200 text-xs"
      disabled={disabled}
      onClick={onClick}
      size="sm"
      type="button"
      variant="secondary"
    >
      {children}
    </Button>
  );
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
