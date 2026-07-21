import assert from "node:assert/strict";
import { test } from "node:test";
import ognSource from "../data/sets/ogn.json";
import sfdSource from "../data/sets/sfd.json";
import { selectPreferredPrinting } from "../src/server/card-catalog/printing-selection";
import { cardSetFileSchema, type Card } from "../src/server/catalog";

const ognCards = cardSetFileSchema.parse(ognSource);
const sfdCards = cardSetFileSchema.parse(sfdSource);

test("selects the standard Miss Fortune, Buccaneer corpus printing", () => {
  const selected = selectPreferredPrinting(cardsNamed(ognCards, "Miss Fortune, Buccaneer"));

  assert.equal(selected.riftbound_id, "ogn-193-298");
  assert.equal(selected.public_code, "OGN-193/298");
  assert.equal(selected.metadata.alternate_art, false);
  assert.equal(selected.metadata.overnumbered, false);
  assert.equal(selected.metadata.signature, false);
  assert.equal(
    selected.media.image_url,
    "https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/e6ff9ad3d6e2b96ff76cda4c7bc75415c1cdcced-744x1039.png",
  );
});

test("selects the standard Spiritforged printing", () => {
  const candidates = sfdCards.filter((card) =>
    card.public_code === "SFD-143/221" || card.public_code === "SFD-143a/221",
  );
  assert.equal(selectPreferredPrinting(candidates).public_code, "SFD-143/221");
});

test("selects Swift Scout's lowest standard collector number", () => {
  const selected = selectPreferredPrinting(cardsNamed(ognCards, "Swift Scout"));

  assert.equal(selected.public_code, "OGN-263/298");
  assert.equal(selected.collector_number, 263);
  assert.equal(selected.metadata.overnumbered, false);
  assert.equal(selected.metadata.signature, false);
});

function cardsNamed(cards: readonly Card[], name: string) {
  return cards.filter((card) => card.name === name);
}
