import assert from "node:assert/strict";
import { test } from "node:test";
import {
  groupCardsByAttachment,
} from "../src/features/game-board/components/attachment-layout";

test("one canonical attachment grouping drives Base and Battlefield cards without hiding siblings", () => {
  const cards = [
    { instanceId: "sprite" },
    { instanceId: "brutalizer-1", attachedToCardInstanceId: "sprite" },
    { instanceId: "brutalizer-2", attachedToCardInstanceId: "sprite" },
    { instanceId: "sterak", attachedToCardInstanceId: "sprite" },
    { instanceId: "unattached-gear", attachedToCardInstanceId: null },
  ];
  assert.deepEqual(groupCardsByAttachment(cards), [
    { host: cards[0], attachments: [cards[1], cards[2], cards[3]] },
    { host: cards[4], attachments: [] },
  ]);
});

test("groups preserve projected attachment order, independent state and identity across reprojection", () => {
  const host = { instanceId: "unit-a", isExhausted: true, might: 5 };
  const otherHost = { instanceId: "unit-b", isExhausted: false, might: 2 };
  const oldest = { instanceId: "gear-z", attachedToCardInstanceId: host.instanceId, isExhausted: false, might: 1 };
  const middle = { instanceId: "gear-a", attachedToCardInstanceId: host.instanceId, isExhausted: true, might: 3 };
  const newest = { instanceId: "gear-m", attachedToCardInstanceId: host.instanceId, isExhausted: false, might: 2 };
  const otherGear = { instanceId: "gear-b", attachedToCardInstanceId: otherHost.instanceId, isExhausted: true, might: 1 };
  const cards = [host, otherHost, oldest, otherGear, middle, newest];
  const groups = groupCardsByAttachment(cards);
  assert.deepEqual(groups, [
    { host, attachments: [oldest, middle, newest] },
    { host: otherHost, attachments: [otherGear] },
  ]);
  assert.equal(groups[0]!.host, host);
  assert.equal(groups[0]!.attachments[1], middle);
  assert.deepEqual(groupCardsByAttachment(structuredClone(cards)), groups);

  const detached = cards.map((card) => card === middle ? { ...middle, attachedToCardInstanceId: null } : card);
  assert.deepEqual(groupCardsByAttachment(detached)[0]!.attachments, [oldest, newest]);
  assert.equal(groupCardsByAttachment(detached).length, 3);
  const reattached = [...detached.filter((card) => card.instanceId !== middle.instanceId), middle];
  assert.deepEqual(groupCardsByAttachment(reattached)[0]!.attachments, [oldest, newest, middle]);
});

test("one attachment is one group and absent hosts do not hide projected cards", () => {
  const host = { instanceId: "unit" };
  const gear = { instanceId: "gear", attachedToCardInstanceId: "unit" };
  assert.deepEqual(groupCardsByAttachment([host, gear]), [{ host, attachments: [gear] }]);
  assert.deepEqual(groupCardsByAttachment([gear]), [{ host: gear, attachments: [] }]);
  assert.deepEqual(groupCardsByAttachment([]), []);
});

test("a detached card becomes its own group while the remaining attachments retain their host", () => {
  const cards = [
    { instanceId: "unit" },
    { instanceId: "gear-a", attachedToCardInstanceId: null },
    { instanceId: "gear-b", attachedToCardInstanceId: "unit" },
  ];
  assert.deepEqual(groupCardsByAttachment(cards).map((group) => ({
    host: group.host.instanceId,
    attachments: group.attachments.map((card) => card.instanceId),
  })), [
    { host: "unit", attachments: ["gear-b"] },
    { host: "gear-a", attachments: [] },
  ]);
});
