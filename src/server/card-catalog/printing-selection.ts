type PrintingCandidate = {
  id?: string;
  collector_number?: number | string | null;
  metadata: {
    alternate_art?: boolean;
    overnumbered?: boolean;
    signature?: boolean;
  };
  public_code: string;
  riftbound_id?: string;
};

export type UnresolvedPrintingGroup<T> = {
  identity: string;
  candidates: readonly T[];
  reason: string;
};

export class CanonicalPrintingSelectionError extends Error {
  readonly code = "canonical_printing_unresolved";

  constructor(
    public readonly identity: string,
    public readonly candidates: readonly PrintingCandidate[],
    reason: string,
  ) {
    super(`Canonical printing for ${identity} is unresolved: ${reason}`);
  }
}

export function selectPreferredPrinting<T extends PrintingCandidate>(
  printings: readonly T[],
  identity = printingGroupLabel(printings),
): T {
  if (printings.length === 0) {
    throw new CanonicalPrintingSelectionError(
      identity,
      printings,
      "the printing group is empty.",
    );
  }

  const standardPrintings = printings.filter(isStandardPrinting);
  if (standardPrintings.length === 0) {
    throw new CanonicalPrintingSelectionError(
      identity,
      printings,
      "every candidate is alternate art, overnumbered, or a signature printing.",
    );
  }

  const rankedPrintings = [...standardPrintings].sort(comparePrintingPreference);
  if (
    rankedPrintings.length > 1 &&
    comparePrintingPreference(rankedPrintings[0]!, rankedPrintings[1]!) === 0
  ) {
    throw new CanonicalPrintingSelectionError(
      identity,
      printings,
      "multiple standard candidates have the same collector and printing codes.",
    );
  }

  return rankedPrintings[0]!;
}

export function selectPrintingGroupRepresentative<T extends PrintingCandidate>(
  printings: readonly T[],
): T {
  if (printings.length === 0) {
    throw new Error("Cannot select a review representative from an empty printing group.");
  }

  const standardPrintings = printings.filter(isStandardPrinting);
  return [...(standardPrintings.length > 0 ? standardPrintings : printings)]
    .sort(
      (left, right) =>
        presentationReviewRank(left) - presentationReviewRank(right) ||
        comparePrintingPreference(left, right) ||
        normalizeCode(left.id ?? "").localeCompare(normalizeCode(right.id ?? "")),
    )[0]!;
}

export function resolveCanonicalPrintingGroups<T extends PrintingCandidate>(
  printings: readonly T[],
  getIdentity: (printing: T) => string,
): {
  selected: T[];
  unresolved: UnresolvedPrintingGroup<T>[];
} {
  const groups = new Map<string, T[]>();
  for (const printing of printings) {
    const identity = getIdentity(printing);
    groups.set(identity, [...(groups.get(identity) ?? []), printing]);
  }

  const selected: T[] = [];
  const unresolved: UnresolvedPrintingGroup<T>[] = [];
  for (const [identity, candidates] of [...groups].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    try {
      selected.push(selectPreferredPrinting(candidates, identity));
    } catch (caught) {
      if (!(caught instanceof CanonicalPrintingSelectionError)) throw caught;
      unresolved.push({ identity, candidates, reason: caught.message });
    }
  }

  return { selected, unresolved };
}

export function comparePrintingPreference(
  left: PrintingCandidate,
  right: PrintingCandidate,
) {
  return (
    printingVariantRank(left) - printingVariantRank(right) ||
    collectorNumber(left) - collectorNumber(right) ||
    printingSuffixRank(left) - printingSuffixRank(right) ||
    normalizeCode(left.public_code).localeCompare(normalizeCode(right.public_code)) ||
    normalizeCode(left.riftbound_id ?? "").localeCompare(
      normalizeCode(right.riftbound_id ?? ""),
    )
  );
}

export function isStandardPrinting(card: PrintingCandidate) {
  return (
    card.metadata.alternate_art !== true &&
    card.metadata.overnumbered !== true &&
    card.metadata.signature !== true
  );
}

function collectorNumber(card: PrintingCandidate) {
  const value = card.collector_number;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const numericPrefix = value.match(/^\d+/)?.[0];
    if (numericPrefix) return Number(numericPrefix);
  }
  return Number.MAX_SAFE_INTEGER;
}

function printingSuffixRank(card: PrintingCandidate) {
  const collectorCode = card.public_code.split("/", 1)[0] ?? card.public_code;
  return /(?:[a-z]|\*)$/i.test(collectorCode) ? 1 : 0;
}

function printingVariantRank(card: PrintingCandidate) {
  return isStandardPrinting(card) ? 0 : 1;
}

function presentationReviewRank(card: PrintingCandidate) {
  return (
    Number(card.metadata.alternate_art === true) * 4 +
    Number(card.metadata.overnumbered === true) * 2 +
    Number(card.metadata.signature === true)
  );
}

function normalizeCode(value: string) {
  return value.normalize("NFKC").trim().toLowerCase();
}

function printingGroupLabel(printings: readonly PrintingCandidate[]) {
  return printings[0]?.public_code ?? "unknown printing group";
}
