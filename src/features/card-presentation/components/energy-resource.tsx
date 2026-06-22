import { ResourceChip } from "./resource-chip";

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
