export type AttachmentGroupDescriptor = {
  id: string;
  isUnit: boolean;
  attachmentIds: readonly string[];
};

export type AttachmentGroupBox = AttachmentGroupDescriptor & {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type AttachmentGroupPlacement = {
  groups: AttachmentGroupBox[];
  anchorIds: string[];
  width: number;
  height: number;
};

/** Visual placement only. Relationships and attachment order come from projection. */
export function placeAttachmentGroups({
  previous,
  current,
  anchorIds = [],
  anchorOffset = { x: 0, y: 0 },
  minimumExtent = { width: 0, height: 0 },
  newGroupOrigin,
  gap = 8,
}: {
  previous: readonly AttachmentGroupBox[];
  current: readonly AttachmentGroupBox[];
  anchorIds?: readonly string[];
  anchorOffset?: { x: number; y: number };
  minimumExtent?: { width: number; height: number };
  newGroupOrigin?: { x: number; y: number };
  gap?: number;
}): AttachmentGroupPlacement | null {
  const previousById = new Map(previous.map((group) => [group.id, group]));
  const changed = current.filter((group) => {
    const before = previousById.get(group.id);
    return group.isUnit && before &&
      (before.attachmentIds.length !== group.attachmentIds.length ||
        before.attachmentIds.some((id, index) => id !== group.attachmentIds[index]));
  });
  const changedIds = new Set(changed.map((group) => group.id));
  const retainedAnchors = new Set([
    ...anchorIds.filter((id) => current.some((group) => group.id === id && group.isUnit)),
    ...changedIds,
  ]);
  if (retainedAnchors.size === 0) return null;

  // The receiving host has priority over neighbors, including a former host
  // when Equipment is transferred between Units. Keep DOM order untouched.
  const priority = (group: AttachmentGroupBox) => {
    if (changedIds.has(group.id)) {
      const before = previousById.get(group.id)!;
      return group.attachmentIds.some((id) => !before.attachmentIds.includes(id)) ? 0 : 1;
    }
    return retainedAnchors.has(group.id) ? 2 : previousById.has(group.id) ? 3 : 4;
  };
  const placed = new Map<string, AttachmentGroupBox>();
  for (const group of [...current].sort((a, b) => priority(a) - priority(b))) {
    const before = previousById.get(group.id);
    const offset = retainedAnchors.has(group.id) ? anchorOffset : { x: 0, y: 0 };
    let box = {
      ...group,
      x: before ? before.x + offset.x : newGroupOrigin?.x ?? group.x,
      y: before ? before.y + offset.y : newGroupOrigin?.y ?? group.y,
    };
    // Preserve vacant gaps and the existing row. Make room to the right rather
    // than moving the receiving Unit or shrinking its Equipment hit areas.
    let collision: AttachmentGroupBox | undefined;
    while ((collision = [...placed.values()].find((other) => overlaps(box, other, gap)))) {
      box = { ...box, x: collision.x + collision.width + gap };
    }
    placed.set(group.id, box);
  }
  const groups = current.map((group) => placed.get(group.id)!);
  return {
    groups,
    anchorIds: [...retainedAnchors],
    width: Math.max(minimumExtent.width, ...groups.map((group) => group.x + group.width + gap)),
    height: Math.max(minimumExtent.height, ...groups.map((group) => group.y + group.height + gap)),
  };
}

function overlaps(a: AttachmentGroupBox, b: AttachmentGroupBox, gap: number) {
  return a.x < b.x + b.width + gap && a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
}
