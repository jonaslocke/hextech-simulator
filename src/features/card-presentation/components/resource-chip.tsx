/* eslint-disable @next/next/no-img-element */
import { cn } from "@/shared/utils/cn";

export function ResourceChip({
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
          className="h-full w-auto object-contain"
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
        tone === "energy" &&
          "border-yellow-300/40 bg-yellow-300/10 text-yellow-100",
        tone === "might" && "border-white/30 bg-white/15 text-white",
        tone === "neutral" &&
          "border-slate-300/30 bg-slate-300/10 text-slate-100",
        tone === "power" &&
          "border-violet-300/40 bg-violet-300/10 text-violet-100",
        tone === "rainbow" &&
          "border-fuchsia-300/40 bg-fuchsia-300/10 text-fuchsia-100",
      )}
      title={label}
    >
      {label}
    </span>
  );
}
