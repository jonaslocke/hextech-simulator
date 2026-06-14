"use client";

export function CountBadge({ value }: { value: number }) {
  return (
    <div className="-top-2 left-1/2 absolute bg-[#111827] px-2 py-0.5 rounded font-bold text-base -translate-x-1/2">
      {value}
    </div>
  );
}
