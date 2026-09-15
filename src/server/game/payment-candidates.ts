import { compareRestrictions, restrictionAllowsPayment, type PaymentContext, type ResourceRestriction } from "./payment-restrictions";

export type PaymentCandidate = {
  kind: "energy" | "power";
  amount: number;
  restriction: ResourceRestriction;
  usage: string;
  domain?: string;
  sourceId?: string;
  acquisition: "pool" | "exhaust" | "recycle";
  runeState?: "exhausted" | "exhausted-by-plan" | "ready";
  order: number;
  pool?: "ordinary" | "conditional" | "restricted";
};

export function candidateIsEligible(candidate: PaymentCandidate, context: PaymentContext, domains?: readonly string[]) {
  return candidate.amount > 0 && restrictionAllowsPayment(candidate.restriction, context) &&
    (candidate.acquisition !== "recycle" || candidate.runeState === "exhausted" || candidate.runeState === "exhausted-by-plan") &&
    (candidate.kind !== "power" || domains === undefined || candidate.domain === "Rainbow" || domains.includes(candidate.domain!));
}

/** Restriction containment is a partial order, not an Array.sort comparator.
 * Take the earliest undominated candidate each time. This preserves subset
 * precedence without non-transitive comparisons for overlapping restrictions.
 * Pooled resources form an earlier stage. Within a stage restriction specificity
 * wins even over domain flexibility. Domain/exhaust-before-recycle break ties
 * only for equivalent restrictions; incomparable restrictions use source order. */
export function orderPaymentCandidates<T extends PaymentCandidate>(candidates: readonly T[]): T[] {
  const pending = [...candidates].sort((a, b) => a.order - b.order);
  const result: T[] = [];
  const precedes = (a: T, b: T) => {
    if (a.acquisition === "pool" && b.acquisition !== "pool") return true;
    if (b.acquisition === "pool" && a.acquisition !== "pool") return false;
    const relation = compareRestrictions(a.restriction, b.restriction);
    if (relation === "narrower") return true;
    if (relation !== "equivalent") return false;
    if (a.kind === "power" && b.kind === "power") {
      if (a.domain !== "Rainbow" && b.domain === "Rainbow") return true;
      if (a.domain === "Rainbow" && b.domain !== "Rainbow") return false;
    }
    return a.acquisition === "exhaust" && b.acquisition === "recycle";
  };
  while (pending.length > 0) {
    const position = pending.findIndex((candidate) => !pending.some((other) => precedes(other, candidate)));
    result.push(pending.splice(position, 1)[0]!);
  }
  return result;
}
