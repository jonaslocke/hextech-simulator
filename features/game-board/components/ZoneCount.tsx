"use client";

export function ZoneCount({ value }: { value: number }) {
  return (
    <div className="flex justify-center items-center h-full font-bold text-4xl">
      {value}
    </div>
  );
}
