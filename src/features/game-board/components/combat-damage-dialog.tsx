"use client";

import type { GameProjection } from "@/shared/game";
import { Button } from "@/shared/components/button";
import { cn } from "@/shared/utils/cn";
import { useMemo, useState } from "react";
import type { MouseEvent } from "react";
import type { BoardCatalogCard } from "../board-view-model";
import type { Card } from "../types";
import { CardTile, type CardTileSize } from "./card-tile";

type CombatDamageChoice = Extract<
  NonNullable<GameProjection["actions"][number]["choice"]>,
  { kind: "combatDamage" }
>;

type DamageAllocation = {
  targetUnitId: string;
  amount: number;
};

type DamagePriority = "tank" | "standard" | "backline";

type DamageTargetViewModel = {
  amount: number;
  card: Card;
  hasBackline: boolean;
  hasTank: boolean;
  index: number;
  isLethalAssigned: boolean;
  isPartial: boolean;
  lethalAmount: number;
  priority: DamagePriority;
  priorityOrder: number;
  unitId: string;
};

type DamagePlanValidation = {
  isValid: boolean;
  message: string;
};

export function CombatDamageDialog({
  choice,
  cardsByInstanceId,
  onSubmit,
}: {
  choice: CombatDamageChoice;
  cardsByInstanceId: Record<string, BoardCatalogCard>;
  onSubmit: (allocations: DamageAllocation[]) => void;
}) {
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [assignmentOrder, setAssignmentOrder] = useState<string[]>([]);

  const targets = useMemo(
    () =>
      choice.targets
        .map((target, index) => {
          const catalogCard = cardsByInstanceId[target.unitId];
          const card = buildCard(target.unitId, catalogCard);
          const hasBackline = hasBacklineKeyword(card.rulesText);
          const hasTank = Boolean(
            target.hasTank || hasTankKeyword(card.rulesText),
          );
          const amount = amounts[target.unitId] ?? 0;
          const lethalAmount = Math.max(1, target.lethalAmount);
          const priority = getDamagePriority({ hasBackline, hasTank });

          return {
            amount,
            card,
            hasBackline,
            hasTank,
            index,
            isLethalAssigned: amount >= lethalAmount,
            isPartial: amount > 0 && amount < lethalAmount,
            lethalAmount,
            priority,
            priorityOrder: getDamagePriorityOrder(priority),
            unitId: target.unitId,
          } satisfies DamageTargetViewModel;
        })
        .sort(
          (left, right) =>
            left.priorityOrder - right.priorityOrder ||
            left.index - right.index,
        ),
    [amounts, cardsByInstanceId, choice.targets],
  );

  const targetById = useMemo(
    () => new Map(targets.map((target) => [target.unitId, target])),
    [targets],
  );

  const positiveAssignmentOrder = useMemo(
    () => getPositiveAssignmentOrder({ amounts, assignmentOrder, targets }),
    [amounts, assignmentOrder, targets],
  );

  const allocations = useMemo<DamageAllocation[]>(
    () =>
      positiveAssignmentOrder.flatMap((targetUnitId) => {
        const amount = amounts[targetUnitId] ?? 0;

        return amount > 0 ? [{ targetUnitId, amount }] : [];
      }),
    [amounts, positiveAssignmentOrder],
  );

  const assigned = allocations.reduce((sum, entry) => sum + entry.amount, 0);
  const remaining = Math.max(0, choice.totalDamage - assigned);
  const validation = validateDamagePlan({
    allocations,
    assigned,
    targetById,
    totalDamage: choice.totalDamage,
  });
  const canSubmit = validation.isValid;
  const hasTankTargets = targets.some((target) => target.hasTank);
  const hasBacklineTargets = targets.some((target) => target.hasBackline);
  const cardSize = getDamageCardSize(targets.length);

  const assignDamage = (unitId: string) => {
    if (assigned >= choice.totalDamage) {
      return;
    }

    const target = targetById.get(unitId);

    if (!target || !canAssignDamage({ target, targets, assignmentOrder })) {
      return;
    }

    setAmounts((currentAmounts) => ({
      ...currentAmounts,
      [unitId]: clamp((currentAmounts[unitId] ?? 0) + 1, 0, choice.totalDamage),
    }));
    setAssignmentOrder((currentOrder) =>
      currentOrder.includes(unitId) ? currentOrder : [...currentOrder, unitId],
    );
  };

  const removeDamage = (unitId: string) => {
    const currentAmount = targetById.get(unitId)?.amount ?? 0;

    setAmounts((currentAmounts) => {
      const nextAmount = Math.max(0, (currentAmounts[unitId] ?? 0) - 1);
      const nextAmounts = { ...currentAmounts };

      if (nextAmount === 0) {
        delete nextAmounts[unitId];
      } else {
        nextAmounts[unitId] = nextAmount;
      }

      return nextAmounts;
    });

    if (currentAmount <= 1) {
      setAssignmentOrder((currentOrder) =>
        currentOrder.filter((targetUnitId) => targetUnitId !== unitId),
      );
    }
  };

  const resetAssignments = () => {
    setAmounts({});
    setAssignmentOrder([]);
  };

  return (
    <div className="z-[2147483647] fixed inset-0 flex justify-center items-center bg-black/72 backdrop-blur-sm p-4">
      <section
        aria-labelledby="combat-damage-title"
        aria-modal="true"
        className={cn(
          "gap-4 grid bg-slate-950/80 shadow-2xl shadow-black/85 p-4 border border-amber-200/22 rounded-xl ring-1 ring-amber-300/10 w-full max-w-6xl overflow-hidden text-slate-100",
          "supports-backdrop-filter:bg-slate-950/64 supports-backdrop-filter:backdrop-blur-md",
          "max-h-[min(46rem,calc(100vh-2rem))]",
        )}
        role="dialog"
      >
        <header className="flex md:flex-row flex-col md:justify-between md:items-end gap-3">
          <div className="min-w-0">
            <p className="font-mono font-semibold text-[11px] text-amber-200/80 uppercase tracking-[0.22em]">
              Combat damage
            </p>
            <h2
              className="mt-1 font-semibold text-slate-50 text-xl leading-tight"
              id="combat-damage-title"
            >
              Assign {choice.totalDamage} damage
            </h2>
            <p className="mt-1 max-w-3xl text-slate-400 text-sm leading-5">
              Left click a unit to assign 1 damage. Right click to remove 1.
              Assign lethal damage before moving to another unit.
              {hasTankTargets ? " Tank units are first." : ""}
              {hasBacklineTargets ? " Backline units are last." : ""}
            </p>
          </div>

          <DamageMeter
            assigned={assigned}
            remaining={remaining}
            totalDamage={choice.totalDamage}
          />
        </header>

        <div
          className={cn(
            "place-items-center gap-x-4 gap-y-6 grid px-2 py-3 max-h-[min(31rem,calc(100vh-15rem))] overflow-auto [scrollbar-color:rgba(251,191,36,0.25)_transparent]",
            getDamageGridClass(cardSize),
          )}
        >
          {targets.map((target) => {
            const canAssign =
              assigned < choice.totalDamage &&
              canAssignDamage({ target, targets, assignmentOrder });
            const canRemove = target.amount > 0;

            return (
              <DamageTargetCard
                canAssign={canAssign}
                canRemove={canRemove}
                cardSize={"xl"}
                key={target.unitId}
                onAssign={() => assignDamage(target.unitId)}
                onRemove={(event) => {
                  event.preventDefault();
                  removeDamage(target.unitId);
                }}
                target={target}
              />
            );
          })}
        </div>

        <footer className="flex md:flex-row flex-col md:justify-between md:items-center gap-3 pt-3 border-white/10 border-t">
          <div aria-live="polite" className="min-h-5 text-sm">
            <span
              className={cn(
                canSubmit
                  ? "text-emerald-200"
                  : assigned === choice.totalDamage
                    ? "text-amber-200"
                    : "text-slate-400",
              )}
            >
              {validation.message}
            </span>
          </div>

          <div className="flex justify-end items-center gap-2">
            <Button
              disabled={assigned === 0}
              onClick={resetAssignments}
              type="button"
              variant="secondary"
            >
              Reset
            </Button>
            <Button
              disabled={!canSubmit}
              onClick={() => onSubmit(allocations)}
              type="button"
            >
              Resolve damage
            </Button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function DamageTargetCard({
  canAssign,
  canRemove,
  cardSize,
  onAssign,
  onRemove,
  target,
}: {
  canAssign: boolean;
  canRemove: boolean;
  cardSize: CardTileSize;
  onAssign: () => void;
  onRemove: (event: MouseEvent<HTMLDivElement>) => void;
  target: DamageTargetViewModel;
}) {
  const isInteractive = canAssign || canRemove;

  return (
    <div
      className={cn(
        "relative flex justify-center min-w-0 overflow-visible transition-opacity",
        !isInteractive && "opacity-45",
      )}
      title={getDamageTargetTitle({ canAssign, canRemove, target })}
    >
      <CardTile
        {...target.card}
        damage={target.amount > 0 ? target.amount : target.card.damage}
        enableHoverPreview
        enableZoneAnimation={false}
        isHighlighted={target.amount > 0}
        onContextAction={onRemove}
        onPrimaryAction={canAssign ? onAssign : undefined}
        preserveOrientation
        size={cardSize}
      />

      <PriorityBadge priority={target.priority} />

      {target.amount > 0 && (
        <span
          className={cn(
            "-top-2 left-1/2 z-20 absolute shadow-black/40 shadow-lg px-2 py-0.5 border rounded-full font-semibold text-[11px] -translate-x-1/2 pointer-events-none",
            target.isLethalAssigned
              ? "border-emerald-200/45 bg-emerald-300/18 text-emerald-50"
              : "border-amber-200/45 bg-amber-300/18 text-amber-50",
          )}
        >
          {target.amount}/{target.lethalAmount}
        </span>
      )}
    </div>
  );
}

function DamageMeter({
  assigned,
  remaining,
  totalDamage,
}: {
  assigned: number;
  remaining: number;
  totalDamage: number;
}) {
  const percentage = totalDamage > 0 ? (assigned / totalDamage) * 100 : 0;

  return (
    <div className="bg-slate-950/36 shadow-black/35 shadow-inner p-2 border border-white/10 rounded-lg min-w-[12rem]">
      <div className="flex justify-between items-center gap-3 text-xs">
        <span className="text-slate-400">Assigned</span>
        <span className="font-mono font-semibold text-amber-100">
          {assigned}/{totalDamage}
        </span>
      </div>
      <div className="bg-white/10 mt-2 rounded-full h-2 overflow-hidden">
        <div
          className="bg-amber-300 shadow-[0_0_14px_rgba(251,191,36,0.22)] rounded-full h-full transition-[width] duration-200 ease-out"
          style={{ width: `${clamp(percentage, 0, 100)}%` }}
        />
      </div>
      <div className="mt-1 text-[11px] text-slate-500 text-right">
        {remaining} remaining
      </div>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: DamagePriority }) {
  if (priority === "standard") {
    return null;
  }

  const label = getDamagePriorityLabel(priority);

  return (
    <span
      className={cn(
        "-top-2 -left-2 z-20 absolute shadow-black/40 shadow-lg px-2 py-0.5 border rounded-full font-mono font-semibold text-[10px] uppercase tracking-[0.14em] pointer-events-none",
        priority === "tank" &&
          "border-amber-200/45 bg-amber-300/18 text-amber-50",
        priority === "backline" &&
          "border-violet-200/40 bg-violet-300/16 text-violet-50",
      )}
    >
      {label}
    </span>
  );
}

function validateDamagePlan({
  allocations,
  assigned,
  targetById,
  totalDamage,
}: {
  allocations: DamageAllocation[];
  assigned: number;
  targetById: Map<string, DamageTargetViewModel>;
  totalDamage: number;
}): DamagePlanValidation {
  if (assigned < totalDamage) {
    return {
      isValid: false,
      message: `${totalDamage - assigned} damage remaining.`,
    };
  }

  if (assigned > totalDamage) {
    return {
      isValid: false,
      message: "Too much damage assigned.",
    };
  }

  const visibleAllocations = allocations.filter(
    (allocation) => allocation.amount > 0,
  );

  for (let index = 0; index < visibleAllocations.length - 1; index += 1) {
    const allocation = visibleAllocations[index];
    const target = targetById.get(allocation.targetUnitId);

    if (!target) {
      return { isValid: false, message: "Damage target is unavailable." };
    }

    if (allocation.amount < target.lethalAmount) {
      return {
        isValid: false,
        message: "Assign lethal damage before moving to another unit.",
      };
    }
  }

  let previousPriorityOrder = -1;

  for (const allocation of visibleAllocations) {
    const target = targetById.get(allocation.targetUnitId);

    if (!target) {
      return { isValid: false, message: "Damage target is unavailable." };
    }

    if (target.priorityOrder < previousPriorityOrder) {
      return {
        isValid: false,
        message:
          "Damage must follow Tank first, then normal units, then Backline.",
      };
    }

    previousPriorityOrder = target.priorityOrder;
  }

  return {
    isValid: true,
    message: "Damage assignment is ready to resolve.",
  };
}

function canAssignDamage({
  assignmentOrder,
  target,
  targets,
}: {
  assignmentOrder: string[];
  target: DamageTargetViewModel;
  targets: DamageTargetViewModel[];
}) {
  const lastAssignedTarget = getLastAssignedTarget({
    assignmentOrder,
    targets,
  });

  if (lastAssignedTarget?.isPartial) {
    return lastAssignedTarget.unitId === target.unitId;
  }

  const nextPriorityOrder = getNextRequiredPriorityOrder(targets);

  if (nextPriorityOrder === null) {
    return true;
  }

  if (target.priorityOrder !== nextPriorityOrder) {
    return false;
  }

  if (target.isLethalAssigned) {
    return false;
  }

  return true;
}

function getLastAssignedTarget({
  assignmentOrder,
  targets,
}: {
  assignmentOrder: string[];
  targets: DamageTargetViewModel[];
}) {
  const targetById = new Map(targets.map((target) => [target.unitId, target]));

  return [...assignmentOrder]
    .reverse()
    .map((unitId) => targetById.get(unitId))
    .find((target): target is DamageTargetViewModel => Boolean(target?.amount));
}

function getNextRequiredPriorityOrder(targets: DamageTargetViewModel[]) {
  const incompleteTargets = targets.filter(
    (target) => !target.isLethalAssigned,
  );

  if (incompleteTargets.length === 0) {
    return null;
  }

  return Math.min(...incompleteTargets.map((target) => target.priorityOrder));
}

function getPositiveAssignmentOrder({
  amounts,
  assignmentOrder,
  targets,
}: {
  amounts: Record<string, number>;
  assignmentOrder: string[];
  targets: DamageTargetViewModel[];
}) {
  const orderedIds = assignmentOrder.filter(
    (unitId) => (amounts[unitId] ?? 0) > 0,
  );
  const missingPositiveIds = targets
    .filter(
      (target) => target.amount > 0 && !orderedIds.includes(target.unitId),
    )
    .map((target) => target.unitId);

  return [...orderedIds, ...missingPositiveIds];
}

function buildCard(
  cardInstanceId: string,
  card: BoardCatalogCard | undefined,
): Card {
  return {
    domains: card?.classification.domain ?? [],
    energy: card?.attributes.energy ?? undefined,
    img: card?.media.image_url ?? "",
    instanceId: cardInstanceId,
    might: card?.attributes.might ?? undefined,
    name: card?.name ?? cardInstanceId,
    power: card?.attributes.power ?? undefined,
    publicCode: card?.public_code,
    rulesText: card?.text.plain,
    setLabel: card?.set.label,
    supertype: card?.classification.supertype ?? undefined,
    type: card?.classification.type,
  };
}

function getDamagePriority({
  hasBackline,
  hasTank,
}: {
  hasBackline: boolean;
  hasTank: boolean;
}): DamagePriority {
  if (hasTank) {
    return "tank";
  }

  if (hasBackline) {
    return "backline";
  }

  return "standard";
}

function getDamagePriorityOrder(priority: DamagePriority) {
  switch (priority) {
    case "tank":
      return 0;
    case "standard":
      return 1;
    case "backline":
      return 2;
  }
}

function getDamagePriorityLabel(priority: DamagePriority) {
  switch (priority) {
    case "tank":
      return "Tank";
    case "backline":
      return "Backline";
    case "standard":
    default:
      return "";
  }
}

function getDamageCardSize(targetCount: number): CardTileSize {
  if (targetCount > 10) {
    return "sm";
  }

  if (targetCount > 4) {
    return "md";
  }

  return "lg";
}

function getDamageGridClass(cardSize: CardTileSize) {
  switch (cardSize) {
    case "sm":
      return "grid-cols-[repeat(auto-fit,minmax(5.5rem,1fr))]";
    case "md":
      return "grid-cols-[repeat(auto-fit,minmax(7rem,1fr))]";
    case "lg":
    case "xl":
    default:
      return "grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))]";
  }
}

function getDamageTargetTitle({
  canAssign,
  canRemove,
  target,
}: {
  canAssign: boolean;
  canRemove: boolean;
  target: DamageTargetViewModel;
}) {
  const tags = [
    target.hasTank ? "Tank" : null,
    target.hasBackline ? "Backline" : null,
  ].filter(Boolean);
  const interactions = [
    canAssign ? "left click to assign 1" : null,
    canRemove ? "right click to remove 1" : null,
  ].filter(Boolean);

  return [
    target.card.name,
    tags.length > 0 ? tags.join(" · ") : null,
    `${target.amount}/${target.lethalAmount} damage assigned`,
    interactions.length > 0
      ? interactions.join("; ")
      : "locked by assignment order",
  ]
    .filter(Boolean)
    .join(" — ");
}

function hasTankKeyword(rulesText: string | undefined) {
  return /\btank\b/i.test(rulesText ?? "");
}

function hasBacklineKeyword(rulesText: string | undefined) {
  const text = rulesText ?? "";

  return (
    /\bbackline\b/i.test(text) ||
    /must be assigned(?: combat)? damage last/i.test(text) ||
    /assigned(?: combat)? damage last/i.test(text)
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
