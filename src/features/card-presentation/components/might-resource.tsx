import { cn } from "@/shared/utils/cn";
import { MIGHT_ICON_PATH } from "../lib/resource-assets";
import { ResourceChip } from "./resource-chip";

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
        icon={MIGHT_ICON_PATH}
        label="Might"
        tone="might"
      />
      {value !== undefined && (
        <span className="font-semibold leading-none">{value}</span>
      )}
    </span>
  );
}
