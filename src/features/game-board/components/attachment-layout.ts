type AttachedCard = {
  instanceId?: string;
  attachedToCardInstanceId?: string | null;
};

export type AttachmentCardGroup<T extends AttachedCard> = {
  host: T;
  attachments: T[];
};

export function groupCardsByAttachment<T extends AttachedCard>(
  cards: readonly T[],
): AttachmentCardGroup<T>[] {
  const cardsById = new Map(
    cards.flatMap((card) => (card.instanceId ? [[card.instanceId, card] as const] : [])),
  );
  const attachmentsByHost = new Map<string, T[]>();
  // Projection/location order is attachment order. Do not sort by instance ID
  // or keep a separate client order that could outlive an authoritative detach.
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
