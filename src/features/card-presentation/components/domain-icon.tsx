/* eslint-disable @next/next/no-img-element */
import { cn } from "@/shared/utils/cn";
import { getDomainIconPath } from "../lib/domain-assets";
import { formatDomain } from "../lib/format-domain";

export function DomainIcon({
  compact = false,
  decorative = false,
  domain,
}: {
  compact?: boolean;
  decorative?: boolean;
  domain: string;
}) {
  const icon = getDomainIconPath(domain);

  if (!icon) {
    return null;
  }

  const label = `${formatDomain(domain)} Power`;

  return (
    <img
      alt={decorative ? "" : label}
      className={cn("w-auto object-contain", compact ? "h-3.5" : "h-4")}
      src={icon}
      title={decorative ? undefined : label}
    />
  );
}
