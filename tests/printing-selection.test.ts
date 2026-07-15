import assert from "node:assert/strict";
import { test } from "node:test";
import { selectPreferredPrinting } from "../src/server/card-catalog/printing-selection";

test("prefers a regular printing over showcase, overnumbered, and signature variants", () => {
  const regular = {
    public_code: "SYN-247/100",
    collector_number: 247,
    metadata: { alternate_art: false, overnumbered: false, signature: false },
  };

  assert.equal(
    selectPreferredPrinting([
      {
        public_code: "SYN-299*/100",
        collector_number: 299,
        metadata: { alternate_art: false, overnumbered: false, signature: true },
      },
      {
        public_code: "SYN-299/100",
        collector_number: 299,
        metadata: { alternate_art: false, overnumbered: true, signature: false },
      },
      regular,
    ]),
    regular,
  );
});
