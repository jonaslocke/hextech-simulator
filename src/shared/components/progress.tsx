import { cn } from "@/shared/utils/cn";

function Progress({ className, value = 0 }: { className?: string; value?: number }) {
  const percentage = Math.min(100, Math.max(0, value));

  return (
    <div
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={percentage}
      className={cn("h-4 w-full overflow-hidden rounded-full bg-secondary", className)}
      role="progressbar"
    >
      <div className="h-full bg-primary transition-all" style={{ width: `${percentage}%` }} />
    </div>
  );
}

export { Progress };
