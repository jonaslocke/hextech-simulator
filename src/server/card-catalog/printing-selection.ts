type PrintingCandidate = {
  collector_number?: number | string | null;
  metadata: {
    alternate_art?: boolean;
    overnumbered?: boolean;
    signature?: boolean;
  };
  public_code: string;
};

export function selectPreferredPrinting<T extends PrintingCandidate>(
  printings: readonly T[],
): T {
  const preferred = [...printings].sort(comparePrintingPreference)[0];
  if (!preferred) {
    throw new Error("Cannot select a preferred printing from an empty group.");
  }
  return preferred;
}

export function comparePrintingPreference(
  left: PrintingCandidate,
  right: PrintingCandidate,
) {
  return (
    printingVariantRank(left) - printingVariantRank(right) ||
    collectorNumber(left) - collectorNumber(right) ||
    left.public_code.localeCompare(right.public_code)
  );
}

function collectorNumber(card: PrintingCandidate) {
  const value = card.collector_number;
  if (typeof value === "number") return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return Number.MAX_SAFE_INTEGER;
}

function printingVariantRank(card: PrintingCandidate) {
  return (
    Number(card.metadata.alternate_art === true) * 4 +
    Number(card.metadata.overnumbered === true) * 2 +
    Number(card.metadata.signature === true)
  );
}
