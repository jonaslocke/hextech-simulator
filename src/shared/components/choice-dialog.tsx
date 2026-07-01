"use client";

import { useEffect, useState } from "react";
import { Button } from "./button";
import { DialogPortal } from "./dialog-portal";

export type ChoiceDialogOption = {
  description?: string;
  disabled?: boolean;
  id: string;
  imageUrl?: string;
  label: string;
};

export type ChoiceDialogProps = {
  confirmLabel?: string;
  description?: string;
  isOpen: boolean;
  onCancel?: () => void;
  onConfirm: (selectedIds: string[]) => void;
  options: ChoiceDialogOption[];
  selectionMode: "ordered" | "single";
  title: string;
};

export function ChoiceDialog({
  confirmLabel,
  description,
  isOpen,
  onCancel,
  onConfirm,
  options,
  selectionMode,
  title
}: ChoiceDialogProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [orderedIds, setOrderedIds] = useState<string[]>([]);

  useEffect(() => {
    setSelectedId(null);
    setOrderedIds(options.map((option) => option.id));
  }, [options]);

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
      <div className="fixed inset-0 z-[2147483646] flex items-center justify-center bg-black/55 p-4">
        <section
          aria-modal="true"
          className="grid max-h-[min(42rem,calc(100vh-2rem))] w-full max-w-xl gap-4 overflow-hidden rounded-lg border border-cyan-300/25 bg-slate-950/95 p-4 text-slate-100 shadow-2xl shadow-black/70"
          role="dialog"
        >
          <header>
            <h2 className="text-lg font-semibold leading-tight">{title}</h2>
            {description && (
              <p className="mt-1 text-sm text-slate-400">{description}</p>
            )}
          </header>
          {selectionMode === "single" ? (
            <SingleChoiceList
              onSelect={setSelectedId}
              options={options}
              selectedId={selectedId}
            />
          ) : (
            <OrderedChoiceList
              onOrderChange={setOrderedIds}
              options={options}
              orderedIds={orderedIds}
            />
          )}
          <footer className="flex justify-end gap-2 border-t border-white/10 pt-3">
            {onCancel && (
              <Button onClick={onCancel} type="button" variant="secondary">
                Cancel
              </Button>
            )}
            <Button
              disabled={!canConfirm}
              onClick={() => onConfirm(selectedIds)}
              type="button"
            >
              {confirmLabel ??
                (selectionMode === "ordered" ? "Submit order" : "Confirm")}
            </Button>
          </footer>
        </section>
      </div>
    </DialogPortal>
  );
}

function SingleChoiceList({
  onSelect,
  options,
  selectedId
}: {
  onSelect: (id: string) => void;
  options: ChoiceDialogOption[];
  selectedId: string | null;
}) {
  return (
    <div className="grid max-h-[28rem] gap-2 overflow-auto pr-1">
      {options.map((option) => {
        const isSelected = selectedId === option.id;

        return (
          <button
            className={`flex min-h-16 items-center gap-3 rounded-md border p-2 text-left transition disabled:cursor-not-allowed disabled:opacity-45 ${
              isSelected
                ? "border-cyan-300 bg-cyan-300/15"
                : "border-white/10 bg-white/5 hover:border-cyan-300/40"
            }`}
            disabled={option.disabled}
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
  onOrderChange,
  options,
  orderedIds
}: {
  onOrderChange: (ids: string[]) => void;
  options: ChoiceDialogOption[];
  orderedIds: string[];
}) {
  const optionById = new Map(options.map((option) => [option.id, option]));

  return (
    <ol className="grid max-h-[28rem] gap-2 overflow-auto pr-1">
      {orderedIds.map((id, index) => {
        const option = optionById.get(id);

        if (!option) {
          return null;
        }

        return (
          <li
            className="flex min-h-16 items-center gap-3 rounded-md border border-white/10 bg-white/5 p-2"
            key={id}
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded bg-slate-800 text-xs font-semibold text-slate-300">
              {index + 1}
            </span>
            <OptionImage option={option} />
            <OptionText option={option} />
            <div className="ml-auto flex gap-1">
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

function OptionImage({ option }: { option: ChoiceDialogOption }) {
  if (!option.imageUrl) {
    return null;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- Choice options may use catalog or local card assets.
    <img
      alt=""
      className="h-16 w-12 shrink-0 rounded border border-white/10 object-cover"
      src={option.imageUrl}
    />
  );
}

function OptionText({ option }: { option: ChoiceDialogOption }) {
  return (
    <span className="min-w-0">
      <span className="block truncate text-sm font-semibold text-slate-100">
        {option.label}
      </span>
      {option.description && (
        <span className="mt-0.5 block text-xs text-slate-400">
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
  onClick
}: {
  children: string;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="rounded border border-white/10 px-2 py-1 text-[11px] text-slate-300 transition enabled:hover:border-cyan-300/40 enabled:hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
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
