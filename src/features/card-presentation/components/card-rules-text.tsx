/* eslint-disable @next/next/no-img-element */
import { getDomainIconPath } from "../lib/domain-assets";
import { formatDomain } from "../lib/format-domain";
import { getKeywordImagePath } from "../lib/keyword-assets";
import { parseCardText } from "../lib/parse-card-text";
import {
  EXHAUST_ICON_PATH,
  MIGHT_ICON_PATH,
} from "../lib/resource-assets";
import type { CardKeyword, CardTextSegment } from "../types";
import { ResourceChip } from "./resource-chip";

export function CardRulesText({ text }: { text: string }) {
  return parseCardText(text).map((paragraph, paragraphIndex) => (
    <p className="leading-snug" key={`paragraph-${paragraphIndex}`}>
      {renderSegments(paragraph.segments)}
    </p>
  ));
}

function renderSegments(segments: CardTextSegment[]) {
  return segments.map((segment, segmentIndex) => {
    const key = `segment-${segmentIndex}`;

    switch (segment.kind) {
      case "text":
        return segment.value;
      case "parenthetical":
        return (
          <span className="text-slate-400 italic" key={key}>
            {renderSegments(segment.children)}
          </span>
        );
      case "keyword":
        return (
          <Keyword
            count={segment.count}
            key={key}
            keyword={segment.keyword}
          />
        );
      case "resource":
        return renderResource(segment.resource, key);
    }
  });
}

function Keyword({
  count,
  keyword,
}: {
  count?: string;
  keyword: CardKeyword;
}) {
  return (
    <span className="mx-0.5 inline-flex items-center gap-1 align-middle font-semibold text-[11px] text-cyan-100">
      <img
        alt={formatKeyword(keyword)}
        className="h-4 w-auto object-contain"
        src={getKeywordImagePath(keyword, "lg")}
      />
      {count && (
        <span className="rounded bg-cyan-200 px-1 text-[10px] font-bold text-slate-950">
          {count}
        </span>
      )}
    </span>
  );
}

function renderResource(
  resource: Extract<CardTextSegment, { kind: "resource" }>['resource'],
  key: string,
) {
  switch (resource.kind) {
    case "energy":
      return (
        <ResourceChip
          compact={false}
          icon={null}
          key={key}
          label={resource.value}
          tone="energy"
        />
      );
    case "exhaust":
      return (
        <ResourceChip
          compact={false}
          icon={EXHAUST_ICON_PATH}
          key={key}
          label="Exhaust"
          tone="neutral"
        />
      );
    case "might":
      return (
        <ResourceChip
          compact={false}
          icon={MIGHT_ICON_PATH}
          key={key}
          label="Might"
          tone="might"
        />
      );
    case "rune":
      return (
        <ResourceChip
          compact={false}
          icon={getDomainIconPath(resource.domain)}
          key={key}
          label={`${formatDomain(resource.domain)} Power`}
          tone={resource.domain === "rainbow" ? "rainbow" : "power"}
        />
      );
  }
}

function formatKeyword(keyword: string) {
  return keyword
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("-");
}
