import type { ReactNode } from "react";

export function SideboardingLayout({
  center,
  left,
  right,
}: {
  center: ReactNode;
  left: ReactNode;
  right: ReactNode;
}) {
  return (
    <section className="mx-auto grid min-h-0 w-full max-w-[112.5rem] flex-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[13.5rem_minmax(0,1fr)_17rem] lg:overflow-visible">
      <div className="min-h-64 lg:min-h-0">{left}</div>
      <div className="min-h-[32rem] min-w-0 lg:min-h-0">{center}</div>
      <div className="min-h-[32rem] lg:min-h-0">{right}</div>
    </section>
  );
}
