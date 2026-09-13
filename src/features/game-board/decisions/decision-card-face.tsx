import { cn } from "@/shared/utils/cn";

/** The card face shared by image-first decisions and informational reveals. */
export function DecisionCardFace({
  imageUrl,
  label,
  className,
}: {
  imageUrl?: string;
  label: string;
  className?: string;
}) {
  return imageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- Card art comes from the viewer-safe catalog projection.
    <img alt={label} className={cn("block w-full rounded-lg object-contain shadow-xl shadow-black/60", className)} src={imageUrl} />
  ) : (
    <span className="flex justify-center items-center bg-slate-900/80 p-3 border border-white/10 rounded-lg aspect-130/181 font-semibold text-slate-200 text-sm text-center">
      {label}
    </span>
  );
}
