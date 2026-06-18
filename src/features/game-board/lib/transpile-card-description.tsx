/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from "react";
import { cn } from "@/shared/utils/cn";
import bodyRune from "../assets/domains/body-16.webp";
import calmRune from "../assets/domains/calm-16.webp";
import chaosRune from "../assets/domains/chaos-16.webp";
import furyRune from "../assets/domains/fury-16.webp";
import mindRune from "../assets/domains/mind-16.webp";
import orderRune from "../assets/domains/order-16.webp";
import rainbowRune from "../assets/domains/rainbow-16.webp";
import exhaustIcon from "../assets/icons/exhaust-24.webp";
import mightIcon from "../assets/icons/might-24.webp";
import {
  cardKeywords,
  getKeywordImage,
  type CardKeyword,
} from "./get-keyword-image";
import { normalizeCardText } from "./normalize-card-description";

type TranspileOptions = {
  compact?: boolean;
};

const keywordSet = new Set<string>(cardKeywords);

export function transpileCardDescription(
  text: string,
  options: TranspileOptions = {},
): ReactNode[] {
  return normalizeCardText(text)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, lineIndex) => (
      <p className="leading-snug" key={`line-${lineIndex}`}>
        {renderInlineText(line, options)}
      </p>
    ));
}

function renderInlineText(text: string, options: TranspileOptions) {
  const segments = text.split(/(\([^)]*\)|\[[^\]]+\]|:rb_[a-z0-9_]+:)/g);

  return segments.flatMap((segment, index) => {
    if (!segment) {
      return [];
    }

    const key = `segment-${index}`;

    if (segment.startsWith("(") && segment.endsWith(")")) {
      return (
        <span className="text-slate-400 italic" key={key}>
          {renderInlineText(segment.slice(1, -1), options)}
        </span>
      );
    }

    if (segment.startsWith("[") && segment.endsWith("]")) {
      return renderKeyword(segment.slice(1, -1), key, options);
    }

    if (segment.startsWith(":rb_") && segment.endsWith(":")) {
      return renderResourceToken(segment, key, options);
    }

    return segment;
  });
}

function renderKeyword(
  value: string,
  key: string,
  { compact = false }: TranspileOptions,
) {
  const keywordMatch = value.trim().match(/^([A-Za-z-]+)(?:\s+(\d+))?$/);

  if (!keywordMatch) {
    return `[${value}]`;
  }

  const keyword = keywordMatch[1].toLowerCase();
  const count = keywordMatch[2];

  if (!keywordSet.has(keyword)) {
    return `[${value}]`;
  }
  const keywordImage = getKeywordImage({
    keyword: keyword as CardKeyword,
    size: compact ? "md" : "lg",
  });

  return (
    <span
      className={cn(
        "mx-0.5 inline-flex items-center gap-1 align-middle font-semibold text-cyan-100",
        compact ? "text-[10px]" : "text-[11px]",
      )}
      key={key}
    >
      <img
        alt={formatKeyword(keyword)}
        className={cn("w-auto object-contain", compact ? "h-3.5" : "h-4")}
        src={keywordImage}
      />
      {count && (
        <span className="rounded bg-cyan-200 px-1 text-[10px] font-bold text-slate-950">
          {count}
        </span>
      )}
    </span>
  );
}

function renderResourceToken(
  token: string,
  key: string,
  { compact = false }: TranspileOptions,
) {
  const energyMatch = token.match(/^:rb_energy_(\d+):$/);

  if (energyMatch) {
    return (
      <ResourceChip
        compact={compact}
        icon={null}
        key={key}
        label={energyMatch[1]}
        tone="energy"
      />
    );
  }

  if (token === ":rb_exhaust:") {
    return (
      <ResourceChip
        compact={compact}
        icon={exhaustIcon.src}
        key={key}
        label="Exhaust"
        tone="neutral"
      />
    );
  }

  if (token === ":rb_might:") {
    return (
      <ResourceChip
        compact={compact}
        icon={mightIcon.src}
        key={key}
        label="Might"
        tone="might"
      />
    );
  }

  const runeMatch = token.match(/^:rb_rune_([a-z]+):$/);

  if (runeMatch) {
    const domain = runeMatch[1];
    const runeIcon = getDomainIcon(domain);

    return (
      <ResourceChip
        compact={compact}
        icon={runeIcon}
        key={key}
        label={`${formatDomain(domain)} Power`}
        tone={domain === "rainbow" ? "rainbow" : "power"}
      />
    );
  }

  return token;
}

export function EnergyResource({
  compact = false,
  value,
}: {
  compact?: boolean;
  value: number | string;
}) {
  return (
    <ResourceChip
      compact={compact}
      icon={null}
      label={String(value)}
      tone="energy"
    />
  );
}

export function MightResource({
  compact = false,
  value,
}: {
  compact?: boolean;
  value?: number | string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 align-middle text-white",
        compact ? "text-[10px]" : "text-[11px]",
      )}
      title={value === undefined ? "Might" : `Might ${value}`}
    >
      <ResourceChip
        compact={compact}
        icon={mightIcon.src}
        label="Might"
        tone="might"
      />
      {value !== undefined && (
        <span className="font-semibold leading-none">{value}</span>
      )}
    </span>
  );
}

function ResourceChip({
  compact,
  icon,
  label,
  tone,
}: {
  compact: boolean;
  icon: string | null;
  label: string;
  tone: "energy" | "might" | "neutral" | "power" | "rainbow";
}) {
  if (icon) {
    return (
      <span
        className={cn(
          "mx-0.5 inline-flex items-center align-middle",
          compact ? "h-3.5" : "h-4",
        )}
        title={label}
      >
        <img
          alt={label}
          className={cn("h-full w-auto object-contain")}
          src={icon}
        />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "mx-0.5 inline-flex items-center rounded border align-middle font-semibold",
        compact ? "px-1 py-0 text-[10px]" : "px-1.5 py-0.5 text-[11px]",
        tone === "energy" && "border-yellow-300/40 bg-yellow-300/10 text-yellow-100",
        tone === "might" && "border-white/30 bg-white/15 text-white",
        tone === "neutral" && "border-slate-300/30 bg-slate-300/10 text-slate-100",
        tone === "power" && "border-violet-300/40 bg-violet-300/10 text-violet-100",
        tone === "rainbow" && "border-fuchsia-300/40 bg-fuchsia-300/10 text-fuchsia-100",
      )}
      title={label}
    >
      {label}
    </span>
  );
}

function formatKeyword(keyword: string) {
  return keyword
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("-");
}

export function formatDomain(domain: string) {
  return domain.charAt(0).toUpperCase() + domain.slice(1).toLowerCase();
}

export function getDomainIcon(domain: string) {
  const runeMap: Record<string, string> = {
    body: bodyRune.src,
    calm: calmRune.src,
    chaos: chaosRune.src,
    fury: furyRune.src,
    mind: mindRune.src,
    order: orderRune.src,
    rainbow: rainbowRune.src,
  };

  return runeMap[domain] ?? null;
}
