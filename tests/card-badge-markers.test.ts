import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCardText } from "../src/features/card-presentation/lib/parse-card-text";

test("encoded badge markers describe pointed endings and connected conditions", () => {
  const [paragraph] = parseCardText('[Level 6][&gt;] [&gt;&gt;][Reaction][&gt;] Draw.');
  assert.deepEqual(paragraph!.segments.slice(0, 2), [
    { kind: "keyword", keyword: "level", count: "6", pointed: true, connected: false },
    { kind: "keyword", keyword: "reaction", count: undefined, pointed: true, connected: true },
  ]);
  const text = JSON.stringify(parseCardText('[Empowered][>][>>][Deathknell][>] &quot;Effect&quot;'));
  assert.ok(!text.includes('[>]') && !text.includes('[>>]') && !text.includes('&quot;'));
  assert.ok(text.includes('empowered'));
});

test("unrecognized bracket content is preserved", () => {
  assert.deepEqual(parseCardText('[Unknown][>>]')[0]!.segments, [
    { kind: "text", value: "[Unknown]" }, { kind: "text", value: "[>>]" },
  ]);
  assert.deepEqual(parseCardText('[Unknown] [>>] text')[0]!.segments, [
    { kind: "text", value: "[Unknown]" }, { kind: "text", value: " " },
    { kind: "text", value: "[>>]" }, { kind: "text", value: " text" },
  ]);
});
