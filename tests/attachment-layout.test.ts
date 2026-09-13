import assert from "node:assert/strict";
import { test } from "node:test";
import {
  attachmentCardOffset,
  attachmentGroupPadding,
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
  const positions = [0, 1, 2].map(attachmentCardOffset);
  assert.equal(new Set(positions.map(({ left, top }) => `${left}:${top}`)).size, 3);
  assert.ok((positions[2]!.left as number) < 30, "attachment fan stays close to its host");
  assert.ok((attachmentGroupPadding(3).paddingBottom as number) > 0);
  assert.ok((attachmentGroupPadding(3).paddingRight as number) > 0);
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
