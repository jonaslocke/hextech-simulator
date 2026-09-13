import type { CSSProperties } from "react";

type AttachedCard = {
  instanceId?: string;
  attachedToCardInstanceId?: string | null;
};

export type AttachmentCardGroup<T extends AttachedCard> = {
  host: T;
  attachments: T[];
};

// A small fan keeps a physical card group legible without placing Equipment
// so far away that it reads as an independent permanent.
const ATTACHMENT_START_X = 12;
const ATTACHMENT_START_Y = 10;
const ATTACHMENT_STEP_X = 8;
const ATTACHMENT_STEP_Y = 12;

export function groupCardsByAttachment<T extends AttachedCard>(
  cards: readonly T[],
): AttachmentCardGroup<T>[] {
  const cardsById = new Map(
    cards.flatMap((card) => (card.instanceId ? [[card.instanceId, card] as const] : [])),
  );
  const attachmentsByHost = new Map<string, T[]>();
  for (const card of cards) {
    const hostId = card.attachedToCardInstanceId;
    if (!hostId || !cardsById.has(hostId)) continue;
    attachmentsByHost.set(hostId, [...(attachmentsByHost.get(hostId) ?? []), card]);
  }
  return cards
    .filter((card) => !card.attachedToCardInstanceId || !cardsById.has(card.attachedToCardInstanceId))
    .map((host) => ({
      host,
      attachments: host.instanceId ? attachmentsByHost.get(host.instanceId) ?? [] : [],
    }));
}

export function attachmentCardOffset(index: number): CSSProperties {
  return {
    left: ATTACHMENT_START_X + index * ATTACHMENT_STEP_X,
    top: ATTACHMENT_START_Y + index * ATTACHMENT_STEP_Y,
    zIndex: index + 1,
  };
}

export function attachmentGroupPadding(count: number): CSSProperties {
  if (count === 0) return {};
  return {
    paddingBottom: ATTACHMENT_START_Y + (count - 1) * ATTACHMENT_STEP_Y + 12,
    paddingRight: ATTACHMENT_START_X + (count - 1) * ATTACHMENT_STEP_X + 14,
  };
}
