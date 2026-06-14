"use client";

export function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex justify-center items-center px-3 border border-white/15 border-dashed rounded h-full min-h-16 text-slate-400 text-xs text-center">
      {label}
    </div>
  );
}
