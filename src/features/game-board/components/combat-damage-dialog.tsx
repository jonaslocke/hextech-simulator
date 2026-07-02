"use client";

import type { GameProjection } from "@/shared/game";
import { useMemo, useState } from "react";
import type { BoardCatalogCard } from "../board-view-model";

type CombatDamageChoice = NonNullable<
  GameProjection["actions"][number]["choice"]
>;

export function CombatDamageDialog({
  choice,
  cardsByInstanceId,
  onSubmit
}: {
  choice: CombatDamageChoice;
  cardsByInstanceId: Record<string, BoardCatalogCard>;
  onSubmit: (
    allocations: Array<{ targetUnitId: string; amount: number }>
  ) => void;
}) {
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const allocations = choice.targets.flatMap((target) => {
    const amount = amounts[target.unitId] ?? 0;
    return amount > 0 ? [{ targetUnitId: target.unitId, amount }] : [];
  });
  const assigned = allocations.reduce((sum, entry) => sum + entry.amount, 0);
  const tankIncomplete = choice.targets.some(
    (target) =>
      target.hasTank &&
      (amounts[target.unitId] ?? 0) < target.lethalAmount
  );
  const nonTankAssigned = choice.targets.some(
    (target) => !target.hasTank && (amounts[target.unitId] ?? 0) > 0
  );
  const sequenceValid = useMemo(
    () => allocations.every(
      (entry, index) =>
        index === allocations.length - 1 ||
        entry.amount >= (
          choice.targets.find(
            (target) => target.unitId === entry.targetUnitId
          )?.lethalAmount ?? 1
        )
    ),
    [choice.targets, allocations]
  );
  const canSubmit =
    assigned === choice.totalDamage &&
    !(tankIncomplete && nonTankAssigned) &&
    sequenceValid;

  return (
    <div className="z-[2147483647] fixed inset-0 flex justify-center items-center bg-black/75 p-4">
      <section
        aria-labelledby="combat-damage-title"
        aria-modal="true"
        className="bg-slate-950 shadow-2xl p-5 border border-amber-300/35 rounded-xl w-full max-w-lg text-slate-100"
        role="dialog"
      >
        <p className="font-semibold text-amber-200 text-xs uppercase tracking-[0.18em]">
          Combat damage
        </p>
        <h2 className="mt-1 font-semibold text-xl" id="combat-damage-title">
          Assign {choice.totalDamage} damage
        </h2>
        <p className="mt-1 text-slate-400 text-sm">
          Assign lethal damage to each unit before assigning another. Tank
          units must receive lethal damage first.
        </p>
        <div className="gap-2 grid mt-4">
          {choice.targets.map((target) => (
            <label
              className="flex justify-between items-center gap-3 bg-white/5 px-3 py-2 border border-white/10 rounded"
              key={target.unitId}
            >
              <span>
                <span className="block font-medium">
                  {cardsByInstanceId[target.unitId]?.name ?? target.unitId}
                </span>
                <span className="text-slate-400 text-xs">
                  Lethal {target.lethalAmount}
                  {target.hasTank ? " · Tank" : ""}
                </span>
              </span>
              <input
                aria-label={`Damage assigned to ${cardsByInstanceId[target.unitId]?.name ?? target.unitId}`}
                className="bg-slate-900 px-2 py-1 border border-white/15 rounded w-20 text-right"
                max={choice.totalDamage}
                min={0}
                onChange={(event) => {
                  const amount = Math.max(
                    0,
                    Math.min(
                      choice.totalDamage,
                      Number.parseInt(event.target.value || "0", 10)
                    )
                  );
                  setAmounts((current) => ({
                    ...current,
                    [target.unitId]: amount
                  }));
                }}
                type="number"
                value={amounts[target.unitId] ?? 0}
              />
            </label>
          ))}
        </div>
        <div className="flex justify-between items-center mt-4">
          <span
            className={assigned === choice.totalDamage
              ? "text-emerald-300 text-sm"
              : "text-amber-200 text-sm"}
          >
            {assigned} / {choice.totalDamage} assigned
          </span>
          <button
            className="bg-amber-300 hover:bg-amber-200 disabled:opacity-40 px-4 py-2 rounded font-semibold text-slate-950 text-sm"
            disabled={!canSubmit}
            onClick={() => onSubmit(allocations)}
            type="button"
          >
            Resolve damage
          </button>
        </div>
      </section>
    </div>
  );
}
