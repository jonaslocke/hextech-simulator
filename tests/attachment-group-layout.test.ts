import assert from "node:assert/strict";
import { test } from "node:test";
import { placeAttachmentGroups, type AttachmentGroupBox } from "../src/features/game-board/attachment-group-layout";

function group(id: string, x: number, attachmentIds: string[] = [], width = 108, y = 8): AttachmentGroupBox {
  return { id, x, y, attachmentIds, width, height: 152, isUnit: id.startsWith("unit") };
}

test("normal board layout remains in flow until an existing Unit's attachments change", () => {
  const current = [group("unit", 0, ["gear"])];
  assert.equal(placeAttachmentGroups({ previous: [], current }), null);
  assert.equal(placeAttachmentGroups({ previous: current, current }), null);
});

test("attaching earlier standalone Gear keeps the host's exact position", () => {
  const previous = [group("gear-a", 0), group("gear-b", 116), group("gear-c", 232), group("unit", 348)];
  const current = [group("unit", 0, ["gear-a", "gear-b", "gear-c"], 160)];
  const layout = placeAttachmentGroups({ previous, current })!;
  assert.equal(layout.groups.length, 1);
  assert.equal(layout.groups[0]!.x, 348);
  assert.equal(layout.groups[0]!.y, 8);
  assert.deepEqual(layout.groups[0]!.attachmentIds, current[0]!.attachmentIds);
  assert.ok(layout.width >= 508, "scroll extent includes the anchored expanded group");
});

test("neighbors make room for an expanding host without overlap or moving its anchor", () => {
  const previous = [group("unit-a", 0), group("unit-b", 116), group("unit-c", 232)];
  const current = [group("unit-a", 0, ["gear-a", "gear-b", "gear-c"], 180), previous[1]!, previous[2]!];
  const layout = placeAttachmentGroups({ previous, current })!;
  assert.deepEqual(layout.groups.map(({ id, x }) => [id, x]), [["unit-a", 0], ["unit-b", 188], ["unit-c", 304]]);
});

test("detach and refresh preserve the host and remaining order while the detached card gets its own position", () => {
  const previous = [group("unit", 348, ["gear-a", "gear-b", "gear-c"], 160)];
  const current = [group("unit", 0, ["gear-a", "gear-c"], 136), group("gear-b", 0)];
  const layout = placeAttachmentGroups({ previous, current })!;
  assert.equal(layout.groups[0]!.x, 348);
  assert.equal(layout.groups[1]!.x, 0);
  const refreshed = placeAttachmentGroups({ previous: layout.groups, current, anchorIds: layout.anchorIds })!;
  assert.deepEqual(refreshed, layout);
  assert.equal(placeAttachmentGroups({ previous: layout.groups, current: [group("gear-b", 0)], anchorIds: layout.anchorIds }), null);
});

test("receiving host is anchored on reattachment and neighbors yield to it", () => {
  const previous = [group("unit-old", 0, ["gear"], 132), group("unit-new", 140), group("unit-next", 256)];
  const current = [group("unit-old", 0), group("unit-new", 116, ["gear"], 160), group("unit-next", 284)];
  const result = placeAttachmentGroups({ previous, current })!;
  assert.equal(result.groups[1]!.x, 140);
  assert.equal(result.groups[2]!.x, 308);
});

test("screen anchor compensates for container origin and scroll changes, retaining its row", () => {
  const previous = [group("unit", 200, [], 108, 168)];
  const current = [group("unit", 0, ["gear"], 132)];
  const result = placeAttachmentGroups({ previous, current, anchorOffset: { x: 20, y: -12 } })!;
  assert.equal(result.groups[0]!.x, 220);
  assert.equal(result.groups[0]!.y, 156);
});

test("new groups can fill vacant space without moving an existing attachment group", () => {
  const previous = [group("unit", 348, ["gear"], 132)];
  const current = [group("new-gear", 0), group("unit", 116, ["gear"], 132)];
  const result = placeAttachmentGroups({ previous, current, anchorIds: ["unit"] })!;
  assert.deepEqual(result.groups.map(({ x }) => x), [0, 348]);
});

test("a retained anchor compensates for subsequent layout measurement passes", () => {
  const previous = [group("unit", 348, ["gear"], 132)];
  const result = placeAttachmentGroups({ previous, current: previous, anchorIds: ["unit"], anchorOffset: { x: 0, y: -7.5 } })!;
  assert.equal(result.groups[0]!.x, 348);
  assert.equal(result.groups[0]!.y, 0.5);
});

test("detaching at the scroll edge retains enough canvas to prevent scroll clamping", () => {
  const previous = [group("unit", 348, ["gear-a", "gear-b"], 327)];
  const current = [group("unit", 348, ["gear-a"], 303)];
  const result = placeAttachmentGroups({ previous, current, anchorIds: ["unit"], minimumExtent: { width: 683, height: 168 } })!;
  assert.equal(result.groups[0]!.x, 348);
  assert.equal(result.width, 683);
  assert.equal(result.height, 168);
});

test("new cards start in available row space rather than below the scroll spacer", () => {
  const previous = [group("unit", 348, ["gear"], 132)];
  const current = [previous[0]!, group("new-gear", 0, [], 108, 400)];
  const result = placeAttachmentGroups({ previous, current, anchorIds: ["unit"], newGroupOrigin: { x: 0, y: 8 } })!;
  assert.equal(result.groups[0]!.x, 348);
  assert.equal(result.groups[1]!.x, 0);
  assert.equal(result.groups[1]!.y, 8);
});
