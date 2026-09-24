import type { NumericContribution } from "./numeric-modifiers";
import type { RuntimeCardIndex } from "./primitive-handlers";
import type { GameDocument } from "./state";

/** Only public source identities may be named in a modifier explanation. */
export function presentNumericContributions(game: GameDocument, index: RuntimeCardIndex, contributions: NumericContribution[]) {
  return contributions.filter((entry) => entry.amount !== 0).map((entry, position) => {
    const sourceName = presentPublicSourceName(game, index, entry.sourceCardInstanceId);
    return { id: String(position), amount: entry.amount, sourceName, label: entry.label ?? "Modifier", duration: entry.duration };
  });
}

export function presentPublicSourceName(game: GameDocument, index: RuntimeCardIndex, source: string | null): string {
  const publicIds = new Set([
    ...Object.values(game.state.players).flatMap((p) => [p.zones.legend, p.zones.champion, ...p.zones.base, ...p.zones.trash, ...p.zones.banishment]),
    ...game.state.battlefields.flatMap((b) => [b.cardInstanceId, ...b.units, ...(b.attachedCardInstanceIds ?? [])]),
    ...(game.state.chain?.items ?? []).map((item) => item.sourceCardInstanceId),
  ]);
  const instance = source && publicIds.has(source) ? index.instances.get(source) : undefined;
  return (instance ? index.definitions.get(instance.cardCode)?.card.name : undefined) ?? "Effect";
}
