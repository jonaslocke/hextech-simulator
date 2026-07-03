import { cn } from "@/shared/utils/cn";

type KbdVariant = "default" | "amber";

type KbdProps = React.ComponentProps<"kbd"> & {
  variant?: KbdVariant;
};

const kbdVariantClassName: Record<KbdVariant, string> = {
  default: "bg-muted text-muted-foreground",
  amber:
    "border border-amber-100/45 bg-amber-200/20 px-2 py-0.5 font-mono text-[11px] font-bold text-amber-50 shadow-[0_0_12px_rgba(251,191,36,0.16)]",
};

function Kbd({ className, variant = "default", ...props }: KbdProps) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-flex justify-center items-center gap-1 px-1 rounded-sm w-fit min-w-5 h-5 font-sans font-medium text-xs pointer-events-none select-none",
        "[&_svg:not([class*='size-'])]:size-3",
        "in-data-[slot=tooltip-content]:bg-background/20 in-data-[slot=tooltip-content]:text-background dark:in-data-[slot=tooltip-content]:bg-background/10",
        kbdVariantClassName[variant],
        className,
      )}
      {...props}
    />
  );
}

function KbdGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="kbd-group"
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    />
  );
}

export { Kbd, KbdGroup };
