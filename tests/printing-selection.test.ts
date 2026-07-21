import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CanonicalPrintingSelectionError,
  resolveCanonicalPrintingGroups,
  selectPreferredPrinting,
} from "../src/server/card-catalog/printing-selection";

test("selects the standard unsuffixed printing independent of corpus order", () => {
  const standard = printing("SYN-193/298", 193);
  const alternate = printing("SYN-193a/298", 193, { alternate_art: true });

  assert.equal(selectPreferredPrinting([standard, alternate]), standard);
  assert.equal(selectPreferredPrinting([alternate, standard]), standard);
});

test("uses collector number, suffix, public code, and riftbound id as stable tie-breakers", () => {
  const lowest = printing("SYN-247/300", 247);
  const suffixed = printing("SYN-247a/300", 247);
  const later = printing("SYN-299/300", 299);

  assert.equal(selectPreferredPrinting([later, suffixed, lowest]), lowest);
  assert.equal(selectPreferredPrinting([suffixed, lowest, later]), lowest);
});

test("prefers a regular printing over overnumbered and signature variants", () => {
  const regular = printing("SYN-247/100", 247);

  assert.equal(
    selectPreferredPrinting([
      printing("SYN-299*/100", 299, { signature: true }),
      printing("SYN-299/100", 299, { overnumbered: true }),
      regular,
    ]),
    regular,
  );
});

test("collects duplicate normalized identities before selecting", () => {
  const standard = printing("SYN-143/221", 143);
  const alternate = printing("SYN-143a/221", 143, { alternate_art: true });
  const result = resolveCanonicalPrintingGroups(
    [alternate, standard],
    () => "SYN:syntheticcard",
  );

  assert.deepEqual(result.selected, [standard]);
  assert.deepEqual(result.unresolved, []);
});

test("blocks a group that contains only presentation variants", () => {
  const variants = [
    printing("SYN-307/298", 307, { overnumbered: true }),
    printing("SYN-307*/298", 307, { signature: true }),
  ];

  assert.throws(
    () => selectPreferredPrinting(variants, "SYN:variantonly"),
    CanonicalPrintingSelectionError,
  );
  const result = resolveCanonicalPrintingGroups(variants, () => "SYN:variantonly");
  assert.equal(result.selected.length, 0);
  assert.equal(result.unresolved.length, 1);
});

test("blocks equivalent standard candidates instead of using source order", () => {
  const first = printing("SYN-101/221", 101);
  const second = { ...first, id: "duplicate-source-record" };

  assert.throws(
    () => selectPreferredPrinting([first, second], "SYN:ambiguous"),
    /multiple standard candidates have the same collector and printing codes/,
  );
});

function printing(
  publicCode: string,
  collectorNumber: number,
  metadata: {
    alternate_art?: boolean;
    overnumbered?: boolean;
    signature?: boolean;
  } = {},
) {
  return {
    id: publicCode,
    public_code: publicCode,
    riftbound_id: publicCode.toLowerCase().replace(/[/*]/g, "-"),
    collector_number: collectorNumber,
    metadata: {
      alternate_art: false,
      overnumbered: false,
      signature: false,
      ...metadata,
    },
  };
}
