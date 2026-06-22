import {
  cardKeywords,
  type CardKeyword,
  type CardTextParagraph,
  type CardTextResource,
  type CardTextSegment,
} from "../types";
import { normalizeCardText } from "./normalize-card-text";

const keywordSet = new Set<string>(cardKeywords);

export function parseCardText(text: string): CardTextParagraph[] {
  return normalizeCardText(text)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({
      kind: "paragraph",
      segments: parseInlineText(line),
    }));
}

function parseInlineText(text: string): CardTextSegment[] {
  const segments = text.split(/(\([^)]*\)|\[[^\]]+\]|:rb_[a-z0-9_]+:)/g);

  return segments.flatMap((segment): CardTextSegment[] => {
    if (!segment) {
      return [];
    }

    if (segment.startsWith("(") && segment.endsWith(")")) {
      return [
        {
          children: parseInlineText(segment.slice(1, -1)),
          kind: "parenthetical",
        },
      ];
    }

    if (segment.startsWith("[") && segment.endsWith("]")) {
      return [parseKeywordOrText(segment.slice(1, -1))];
    }

    if (segment.startsWith(":rb_") && segment.endsWith(":")) {
      const resource = parseResource(segment);

      return resource
        ? [{ kind: "resource", resource }]
        : [{ kind: "text", value: segment }];
    }

    return [{ kind: "text", value: segment }];
  });
}

function parseKeywordOrText(value: string): CardTextSegment {
  const keywordMatch = value.trim().match(/^([A-Za-z-]+)(?:\s+(\d+))?$/);

  if (!keywordMatch) {
    return { kind: "text", value: `[${value}]` };
  }

  const keyword = keywordMatch[1].toLowerCase();

  if (!keywordSet.has(keyword)) {
    return { kind: "text", value: `[${value}]` };
  }

  return {
    count: keywordMatch[2],
    keyword: keyword as CardKeyword,
    kind: "keyword",
  };
}

function parseResource(token: string): CardTextResource | null {
  const energyMatch = token.match(/^:rb_energy_(\d+):$/);

  if (energyMatch) {
    return { kind: "energy", value: energyMatch[1] };
  }

  if (token === ":rb_exhaust:") {
    return { kind: "exhaust" };
  }

  if (token === ":rb_might:") {
    return { kind: "might" };
  }

  const runeMatch = token.match(/^:rb_rune_([a-z]+):$/);

  if (runeMatch) {
    return { domain: runeMatch[1], kind: "rune" };
  }

  return null;
}
