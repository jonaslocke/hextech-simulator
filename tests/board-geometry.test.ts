import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BOARD_CARD_DIMENSIONS,
  baseGroupCategory,
  boardCardSize,
  boardGeometryProfile,
  classifyBaseGroup,
  groupPhysicalWidth,
  orderBaseGroups,
  resolveBaseDensity,
  resolveBattlefieldDensity,
  resolveRuneFan,
} from "../src/features/game-board/board-geometry";

test("board geometry uses the two supported viewport profiles and canonical card sizes", () => {
  assert.equal(boardGeometryProfile(900), "reference");
  assert.equal(boardGeometryProfile(768), "compact");
  assert.deepEqual(BOARD_CARD_DIMENSIONS, {
    md: { width: 86, height: 120 },
    lg: { width: 103, height: 144 },
    xl: { width: 126, height: 176 },
  });
  assert.equal(boardCardSize("compact", "legend"), "lg");
  assert.equal(boardCardSize("compact", "champion"), "md");
  assert.equal(boardCardSize("reference", "legend"), "xl");
  assert.equal(boardCardSize("reference", "champion"), "lg");
  assert.equal(boardCardSize("compact", "fixed"), "md");
});

test("Base order partitions categories stably without changing order within a category", () => {
  const groups = [
    { id: "unit-1", kind: "unit" as const, exhausted: false, attachmentCount: 0 },
    { id: "loose-equipment", kind: "equipment" as const, exhausted: false, attachmentCount: 0 },
    { id: "gear-1", kind: "gear" as const, exhausted: false, attachmentCount: 0 },
    { id: "unit-2", kind: "unit" as const, exhausted: true, attachmentCount: 1 },
    { id: "gear-2", kind: "gear" as const, exhausted: false, attachmentCount: 0 },
  ];
  assert.deepEqual(orderBaseGroups(groups).map(({ id }) => id), [
    "gear-1", "gear-2", "unit-1", "unit-2", "loose-equipment",
  ]);
  assert.deepEqual([baseGroupCategory("gear"), baseGroupCategory("unit"), baseGroupCategory("equipment")], [0, 1, 2]);
});

test("Base group classification uses card type and canonical Equipment tags", () => {
  assert.equal(classifyBaseGroup({ type: "Unit" }), "unit");
  assert.equal(classifyBaseGroup({ type: "Gear", tags: [] }), "gear");
  assert.equal(classifyBaseGroup({ type: "Gear", tags: ["Equipment"] }), "equipment");
  assert.equal(classifyBaseGroup({ type: "Gear", tags: ["Equipment"], attachedToCardInstanceId: "unit" }), "equipment");
  assert.equal(classifyBaseGroup({ type: "Gear / Spell", tags: ["Equipment"] }), "equipment");
});

test("Base density uses discrete gaps, attachment strips, real exhausted footprints and wraps only at md/4", () => {
  const host = { kind: "unit" as const, exhausted: false, attachmentCount: 2 };
  assert.equal(groupPhysicalWidth("md", host), 134);
  assert.equal(groupPhysicalWidth("md", { ...host, exhausted: true }), 168);
  assert.deepEqual(resolveBaseDensity({ usableWidth: 400, groups: [host], profile: "reference" }), {
    size: "xl", gap: 8, wraps: false, groupWidths: [176],
  });
  assert.deepEqual(resolveBaseDensity({
    usableWidth: 190,
    groups: [
      { kind: "unit", exhausted: false, attachmentCount: 0 },
      { kind: "unit", exhausted: false, attachmentCount: 0 },
    ],
    profile: "reference",
  }), { size: "md", gap: 8, wraps: false, groupWidths: [86, 86] });
  assert.deepEqual(resolveBaseDensity({
    usableWidth: 175,
    groups: [
      { kind: "unit", exhausted: false, attachmentCount: 0 },
      { kind: "unit", exhausted: false, attachmentCount: 0 },
    ],
    profile: "reference",
  }), { size: "md", gap: 4, wraps: true, groupWidths: [86, 86] });
  assert.equal(resolveBaseDensity({ usableWidth: 1000, groups: [{ kind: "unit", exhausted: false, attachmentCount: 0 }], profile: "compact" }).size, "md");
});

test("Base checks every reference candidate in the specified order before wrapping", () => {
  const groups = [
    { kind: "unit" as const, exhausted: false, attachmentCount: 0 },
    { kind: "unit" as const, exhausted: false, attachmentCount: 0 },
  ];
  const candidates = [
    [260, "xl", 8, false],
    [258, "xl", 4, false],
    [214, "lg", 8, false],
    [212, "lg", 4, false],
    [180, "md", 8, false],
    [178, "md", 4, false],
    [175, "md", 4, true],
  ] as const;
  for (const [usableWidth, size, gap, wraps] of candidates) {
    const result = resolveBaseDensity({ usableWidth, groups, profile: "reference" });
    assert.equal(result.size, size, `size at ${usableWidth}px`);
    assert.equal(result.gap, gap, `gap at ${usableWidth}px`);
    assert.equal(result.wraps, wraps, `wrap at ${usableWidth}px`);
  }
});

test("Rune fan size depends on profile and available width, not current Rune count", () => {
  assert.deepEqual(resolveRuneFan({ usableWidth: 496, profile: "reference" }), { size: "lg", step: 32 });
  assert.deepEqual(resolveRuneFan({ usableWidth: 408, profile: "reference" }), { size: "lg", step: 24 });
  assert.deepEqual(resolveRuneFan({ usableWidth: 384, profile: "compact" }), { size: "md", step: 24 });
  assert.deepEqual(resolveRuneFan({ usableWidth: 383, profile: "compact" }), { size: "md", step: 24 });
});

test("twelve-Rune fan stays in one row with integer offsets and at least 24px exposure", () => {
  for (const [width, profile, size] of [[494, "reference", "lg"], [384, "compact", "md"]] as const) {
    const fan = resolveRuneFan({ usableWidth: width, profile });
    assert.equal(fan.size, size);
    assert.equal(Number.isInteger(fan.step), true);
    assert.ok(fan.step >= 24);
    const card = BOARD_CARD_DIMENSIONS[fan.size];
    const totalWidth = Math.max(card.width, card.height) + 11 * fan.step;
    assert.ok(totalWidth <= width, `${totalWidth}px fan fits in ${width}px`);
    assert.ok(card.width - fan.step >= 24, "each next Rune has at least a 24px exposed strip");
  }
});

test("Battlefield density is independent per side and wraps at md/4", () => {
  assert.deepEqual(resolveBattlefieldDensity({
    usableWidth: 230,
    groups: [{ kind: "unit", exhausted: false, attachmentCount: 0 }, { kind: "unit", exhausted: false, attachmentCount: 0 }],
    profile: "reference",
  }), { size: "lg", gap: 8, wraps: false, groupWidths: [103, 103] });
  assert.deepEqual(resolveBattlefieldDensity({
    usableWidth: 212,
    groups: [{ kind: "unit", exhausted: false, attachmentCount: 0 }, { kind: "unit", exhausted: false, attachmentCount: 0 }],
    profile: "reference",
  }), { size: "lg", gap: 4, wraps: false, groupWidths: [103, 103] });
  assert.deepEqual(resolveBattlefieldDensity({
    usableWidth: 180,
    groups: [{ kind: "unit", exhausted: false, attachmentCount: 0 }, { kind: "unit", exhausted: false, attachmentCount: 0 }],
    profile: "reference",
  }), { size: "md", gap: 8, wraps: false, groupWidths: [86, 86] });
  assert.deepEqual(resolveBattlefieldDensity({
    usableWidth: 175,
    groups: [{ kind: "unit", exhausted: false, attachmentCount: 0 }, { kind: "unit", exhausted: false, attachmentCount: 0 }],
    profile: "reference",
  }), { size: "md", gap: 4, wraps: true, groupWidths: [86, 86] });
});
