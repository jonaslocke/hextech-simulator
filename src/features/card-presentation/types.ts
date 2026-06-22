export const cardKeywords = [
  "accelerate",
  "action",
  "add",
  "assault",
  "deathknell",
  "deflect",
  "equip",
  "ganking",
  "hidden",
  "legion",
  "mighty",
  "quick-draw",
  "reaction",
  "repeat",
  "shield",
  "tank",
  "temporary",
  "vision",
  "weaponmaster",
] as const;

export type CardKeyword = (typeof cardKeywords)[number];

export type CardTextResource =
  | { kind: "energy"; value: string }
  | { kind: "exhaust" }
  | { kind: "might" }
  | { domain: string; kind: "rune" };

export type CardTextSegment =
  | { kind: "text"; value: string }
  | { children: CardTextSegment[]; kind: "parenthetical" }
  | { count?: string; keyword: CardKeyword; kind: "keyword" }
  | { kind: "resource"; resource: CardTextResource };

export type CardTextParagraph = {
  kind: "paragraph";
  segments: CardTextSegment[];
};
