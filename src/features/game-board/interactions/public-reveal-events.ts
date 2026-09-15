/** Initial projection is history. Only subsequent unseen IDs are live events. */
export function newPublicReveals<T extends { id: string }>(seen: Set<string>, reveals: readonly T[]): T[] {
  const fresh = reveals.filter((reveal) => !seen.has(reveal.id));
  reveals.forEach((reveal) => seen.add(reveal.id));
  return fresh;
}
