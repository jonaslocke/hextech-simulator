import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeCardText } from "../src/features/card-presentation/lib/normalize-card-text";
import { parseCardText } from "../src/features/card-presentation/lib/parse-card-text";

test("normalization preserves Riftbound resource token spelling", () => {
  const text = normalizeCardText(
    ":rb_exhaust:: [Reaction] - [Add] :rb_energy_2:. Give me +1 :rb_might: this turn.",
  );

  assert.equal(text.includes(":rb_exhaust:"), true);
  assert.equal(text.includes(":rb_energy_2:"), true);
  assert.equal(text.includes(":rb_might:"), true);
  assert.equal(text.includes(":rbexhaust:"), false);
  assert.equal(text.includes(":rbenergy2:"), false);
  assert.equal(text.includes(":rbmight:"), false);
});

test("parser separates inferred card-text paragraphs", () => {
  const paragraphs = parseCardText(
    "[Hidden] (Hide this.)[Action] (Play this.)Resolve the effect.",
  );

  assert.equal(paragraphs.length, 3);
  assert.deepEqual(
    paragraphs.map(({ segments }) => segments[0]),
    [
      { keyword: "hidden", kind: "keyword", count: undefined },
      { keyword: "action", kind: "keyword", count: undefined },
      { kind: "text", value: "Resolve the effect." },
    ],
  );
});

test("parser represents parenthetical content and nested friendly elements", () => {
  const [paragraph] = parseCardText(
    "[Shield] (+1 :rb_might: while I'm a defender.)",
  );
  const parenthetical = paragraph.segments[2];

  assert.equal(parenthetical.kind, "parenthetical");
  assert.deepEqual(parenthetical, {
    children: [
      { kind: "text", value: "+1 " },
      { kind: "resource", resource: { kind: "might" } },
      { kind: "text", value: " while I'm a defender." },
    ],
    kind: "parenthetical",
  });
});

test("parser recognizes keywords and optional counts", () => {
  const [paragraph] = parseCardText("[Quick-Draw] [Repeat 3] [Unknown 2]");

  assert.deepEqual(paragraph.segments, [
    { count: undefined, keyword: "quick-draw", kind: "keyword" },
    { kind: "text", value: " " },
    { count: "3", keyword: "repeat", kind: "keyword" },
    { kind: "text", value: " " },
    { kind: "text", value: "[Unknown 2]" },
  ]);
});

test("parser recognizes every supported resource form", () => {
  const [paragraph] = parseCardText(
    ":rb_exhaust: :rb_energy_12: :rb_might: :rb_rune_calm: :rb_rune_rainbow:",
  );
  const resources = paragraph.segments
    .filter((segment) => segment.kind === "resource")
    .map((segment) => segment.resource);

  assert.deepEqual(resources, [
    { kind: "exhaust" },
    { kind: "energy", value: "12" },
    { kind: "might" },
    { domain: "calm", kind: "rune" },
    { domain: "rainbow", kind: "rune" },
  ]);
});

test("unknown and malformed notation remains readable text", () => {
  const [paragraph] = parseCardText(
    "[Not Real] [Shield x] :rb_unknown: (unfinished",
  );

  assert.deepEqual(paragraph.segments, [
    { kind: "text", value: "[Not Real]" },
    { kind: "text", value: " " },
    { kind: "text", value: "[Shield x]" },
    { kind: "text", value: " " },
    { kind: "text", value: ":rb_unknown:" },
    { kind: "text", value: " (unfinished" },
  ]);
});
