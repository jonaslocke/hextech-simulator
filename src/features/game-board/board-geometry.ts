export type BoardCardSize = "md" | "lg" | "xl";
export type BoardGeometryProfile = "reference" | "compact";

export const BOARD_CARD_DIMENSIONS: Record<BoardCardSize, { width: number; height: number }> = {
  md: { width: 86, height: 120 },
  lg: { width: 103, height: 144 },
  xl: { width: 126, height: 176 },
};

export function boardGeometryProfile(viewportHeight: number): BoardGeometryProfile {
  return viewportHeight < 850 ? "compact" : "reference";
}

export function boardCardSize(profile: BoardGeometryProfile, purpose: "base" | "battlefield" | "fixed" | "champion" | "legend" | "rune") {
  if (purpose === "fixed") return "md" as const;
  if (purpose === "champion") return profile === "reference" ? "lg" as const : "md" as const;
  if (purpose === "legend") return profile === "reference" ? "xl" as const : "lg" as const;
  if (purpose === "rune" || purpose === "battlefield") return profile === "reference" ? "lg" as const : "md" as const;
  return profile === "reference" ? "lg" as const : "md" as const;
}

export type BaseVisualGroup = {
  kind: "gear" | "unit" | "equipment";
  exhausted: boolean;
  attachmentCount: number;
  attachmentExhausted?: readonly boolean[];
};

export function classifyBaseGroup(card: { type?: string; tags?: readonly string[]; attachedToCardInstanceId?: string | null }): BaseVisualGroup["kind"] {
  const cardTypes = card.type?.split(" / ") ?? [];
  if (cardTypes.includes("Unit")) return "unit";
  if (card.tags?.includes("Equipment")) return "equipment";
  return cardTypes.includes("Gear") ? "gear" : "unit";
}

export type BaseDensity = {
  size: BoardCardSize;
  gap: 4 | 8;
  wraps: boolean;
  groupWidths: number[];
};

export function baseGroupCategory(group: BaseVisualGroup["kind"]) {
  return group === "gear" ? 0 : group === "unit" ? 1 : 2;
}

export function orderBaseGroups<T extends BaseVisualGroup>(groups: readonly T[]): T[] {
  return groups.map((group, index) => ({ group, index }))
    .sort((a, b) => baseGroupCategory(a.group.kind) - baseGroupCategory(b.group.kind) || a.index - b.index)
    .map(({ group }) => group);
}

export function groupPhysicalWidth(size: BoardCardSize, group: BaseVisualGroup) {
  const { width, height } = BOARD_CARD_DIMENSIONS[size];
  const hostFootprint = group.exhausted ? height : width;
  const strip = Math.max(24, Math.round(width * 0.2));
  return hostFootprint + group.attachmentCount * strip;
}

export function resolveBaseDensity({
  usableWidth,
  groups,
  profile,
}: {
  usableWidth: number;
  groups: readonly BaseVisualGroup[];
  profile: BoardGeometryProfile;
}): BaseDensity {
  const ordered = orderBaseGroups(groups);
  const sizes: BoardCardSize[] = profile === "reference" && ordered.length <= 2
    ? ["xl", "lg", "md"]
    : profile === "reference" ? ["lg", "md"] : ["md"];
  const candidates = sizes.flatMap(() => [8, 4] as const).map((gap, index) => ({
    size: sizes[Math.floor(index / 2)]!, gap,
  }));
  for (const candidate of candidates) {
    const groupWidths = ordered.map((group) => groupPhysicalWidth(candidate.size, group));
    const rowWidth = groupWidths.reduce((sum, width) => sum + width, 0) + Math.max(0, groupWidths.length - 1) * candidate.gap;
    if (rowWidth <= usableWidth) return { ...candidate, wraps: false, groupWidths };
  }
  return { size: "md", gap: 4, wraps: true, groupWidths: ordered.map((group) => groupPhysicalWidth("md", group)) };
}

export function resolveRuneFan({ usableWidth, profile }: { usableWidth: number; profile: BoardGeometryProfile }) {
  const sizes: BoardCardSize[] = profile === "reference" ? ["lg", "md"] : ["md"];
  for (const size of sizes) {
    const { width, height } = BOARD_CARD_DIMENSIONS[size];
    const maxFootprint = Math.max(width, height);
    const step = Math.min(32, (usableWidth - maxFootprint) / 11);
    if (step >= 24) return { size, step: Math.floor(Math.min(32, step)) };
  }
  return { size: "md" as const, step: 24 };
}

export function resolveBattlefieldDensity({
  usableWidth,
  groups,
  profile,
}: {
  usableWidth: number;
  groups: readonly BaseVisualGroup[];
  profile: BoardGeometryProfile;
}): BaseDensity {
  const sizes: BoardCardSize[] = profile === "reference" ? ["lg", "md"] : ["md"];
  for (const size of sizes) {
    for (const gap of [8, 4] as const) {
      const groupWidths = groups.map((group) => groupPhysicalWidth(size, group));
      const rowWidth = groupWidths.reduce((sum, width) => sum + width, 0) + Math.max(0, groups.length - 1) * gap;
      if (rowWidth <= usableWidth) return { size, gap, wraps: false, groupWidths };
    }
  }
  return { size: "md", gap: 4, wraps: true, groupWidths: groups.map((group) => groupPhysicalWidth("md", group)) };
}
