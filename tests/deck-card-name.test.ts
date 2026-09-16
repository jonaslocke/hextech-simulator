import assert from "node:assert/strict";
import { test } from "node:test";
import { loadCardCatalog, loadSourceCardCatalog, type Card, type CardCatalog } from "../src/server/catalog";
import { deckCardNameLookupCandidates, parseDeckList, resolveDeckCard, resolveDeckCardIdentity } from "../src/server/deck";

const sourceCatalog = await loadCardCatalog();
const legend = sourceCatalog.byName.get("Fire Below the Mountain")!;

function catalogFor(cards: Card[]): CardCatalog {
  return {
    cards,
    byName: new Map(cards.map((card) => [card.name, card])),
    byPublicCode: new Map(cards.map((card) => [card.public_code, card])),
    setFiles: [],
    versionHash: "identity-fixture",
  };
}

test("deck Legend names require their exact full external identity", () => {
  assert.equal(resolveDeckCard(sourceCatalog, "Ornn, Fire Below the Mountain"), legend);
  for (const name of [
    "Fire Below the Mountain", "Ornn - Fire Below the Mountain",
    "Orn, Fire Below the Mountain", "ornn, Fire Below the Mountain",
    "Ornn,Fire Below the Mountain", "Ornn,  Fire Below the Mountain",
    "Ornn, Fire Below the Mountain ", " Ornn, Fire Below the Mountain",
  ]) assert.equal(resolveDeckCard(sourceCatalog, name), undefined, name);
});

test("deck parser preserves name whitespace while accepting quantity and section syntax", () => {
  for (const name of [" Ornn, Fire Below the Mountain", "Ornn, Fire Below the Mountain "]) {
    const entry = parseDeckList(`Legend:\r\n1 ${name}\r\n`).entries[0]!;
    assert.equal(entry.name, name);
    assert.equal(resolveDeckCard(sourceCatalog, entry.name), undefined);
  }
  const parsed = parseDeckList("  Legend: \r\n  1\tOrnn, Fire Below the Mountain\r\nRune Pool:\r\n12 Fury Rune");
  assert.equal(parsed.entries[0]!.name, "Ornn, Fire Below the Mountain");
  assert.equal(parsed.entries[1]!.section, "Runes");
  assert.throws(() => parseDeckList("Main Deck:\n1 Card"), /Unknown deck section/);
});

test("exact apostrophes and starter title qualifiers remain identity-bearing", () => {
  const voidLegend = { ...legend, name: "Daughter of the Void", tags: ["Kai'Sa"] };
  const catalog = catalogFor([voidLegend, sourceCatalog.byName.get("Dark Child - Starter")!]);
  assert.equal(resolveDeckCard(catalog, "Kai'Sa, Daughter of the Void"), voidLegend);
  assert.equal(resolveDeckCard(catalog, "Kai’Sa, Daughter of the Void"), undefined);
  assert.equal(resolveDeckCard(catalog, "Annie, Dark Child"), undefined);
  assert.equal(resolveDeckCard(catalog, "Annie, Dark Child - Starter")?.public_code, "OGS-017/024");
});

test("multi-tag decorated Legends use verified Champion identity without species aliases", () => {
  const decorated = { ...legend, name: "Yordle, Kennen - Heart of the Tempest", tags: ["Yordle", "Kennen"] };
  const champion: Card = { ...sourceCatalog.byName.get("Ornn, Blacksmith")!, name: "Yordle, Kennen - Lightning Rush", tags: ["Yordle", "Kennen"] };
  const catalog = catalogFor([decorated, champion]);
  assert.equal(resolveDeckCard(catalog, "Kennen, Heart of the Tempest"), decorated);
  assert.equal(resolveDeckCard(catalog, "Yordle, Heart of the Tempest"), undefined);
  assert.equal(resolveDeckCard(catalog, decorated.name), undefined);
  const normalized = { ...decorated, name: "Heart of the Tempest" };
  assert.equal(resolveDeckCard(catalogFor([normalized, champion]), "Kennen, Heart of the Tempest"), normalized);
  assert.equal(resolveDeckCard(catalogFor([normalized]), "Yordle, Heart of the Tempest"), undefined);
});

test("equivalent printings resolve to the standard representation independent of input order", () => {
  const overnumbered = { ...legend, public_code: "SFD-244/221", metadata: { ...legend.metadata, overnumbered: true } };
  for (const cards of [[legend, overnumbered], [overnumbered, legend]]) {
    assert.equal(resolveDeckCard(catalogFor(cards), "Ornn, Fire Below the Mountain"), legend);
  }
  const ambiguous = { ...legend, public_code: "SFD-198/221" };
  assert.equal(resolveDeckCard(catalogFor([legend, ambiguous]), "Ornn, Fire Below the Mountain"), undefined);
});

test("non-Legend comma names and established export identity keep their meaning", () => {
  assert.equal(resolveDeckCard(sourceCatalog, "Ornn, Blacksmith")?.classification.type, "Unit");
  assert.equal(resolveDeckCard(sourceCatalog, "Yi, Meditative")?.name, "Master Yi, Meditative");
});

test("full source resolution preserves maintained canonical identities and source decoration", async () => {
  const catalog = await loadSourceCardCatalog();
  for (const card of sourceCatalog.cards) {
    const name = card.classification.type === "Legend" ? `${card.tags[0]}, ${card.name}` : card.name;
    assert.equal(resolveDeckCard(catalog, name)?.public_code, card.public_code, name);
  }
  assert.equal(resolveDeckCard(catalog, "Kennen, Heart of the Tempest")?.public_code, "VEN-155/166");
  assert.equal(resolveDeckCard(catalog, "Yordle, Heart of the Tempest"), undefined);
  assert.equal(resolveDeckCard(catalog, "Kai'Sa, Daughter of the Void")?.public_code, "OGN-247/298");
  const entry = { section: "Legend" as const, name: "Ornn, Fire Below the Mountain" };
  assert.deepEqual(deckCardNameLookupCandidates(entry, catalog), [entry.name, "Fire Below the Mountain"]);
  assert.equal(resolveDeckCard(catalog, { ...entry, section: "MainDeck" })?.classification.type, "Legend",
    "resolution retains the Legend type so placement validation cannot be bypassed");
});

test("unresolved printing ambiguity has a diagnostic rather than first or last selection", () => {
  const other = { ...legend, public_code: "SFD-198/221" };
  const result = resolveDeckCardIdentity(catalogFor([legend, other]), "Ornn, Fire Below the Mountain");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "deck.ambiguousCard");
  const preferred = catalogFor([legend, other]);
  preferred.canonicalByName = new Map([[legend.name, legend]]);
  assert.equal(resolveDeckCard(preferred, "Ornn, Fire Below the Mountain"), legend);
});
