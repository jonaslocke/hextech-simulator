import type { ReactNode } from "react";
import type { SideboardingViewModel } from "../sideboarding-view-model";
import { CardFace } from "./card-face";

export function FixedDeckPanel({
  viewModel,
}: {
  viewModel: SideboardingViewModel;
}) {
  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-white/10 bg-slate-950/75">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-2.5">
        <FixedSection label="Legend">
          <div className="mx-auto w-full max-w-[8.5rem]">
            <CardFace card={viewModel.legend} />
          </div>
        </FixedSection>

        <FixedSection label="Runes">
          <div className="grid grid-cols-2 gap-2">
            {viewModel.runeGroups.map((group) => (
              <RuneFace key={`rune:${group.canonicalName}`} group={group} />
            ))}
          </div>
        </FixedSection>

        <FixedSection label="Battlefields">
          <div className="space-y-2.5">
            {viewModel.battlefields.map((battlefield) => (
              <BattlefieldFace
                battlefield={battlefield}
                key={battlefield.registeredCardId}
              />
            ))}
          </div>
        </FixedSection>
      </div>
    </aside>
  );
}

function FixedSection({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <section>
      <h2 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
        {label}
      </h2>
      {children}
    </section>
  );
}

function RuneFace({
  group,
}: {
  group: SideboardingViewModel["runeGroups"][number];
}) {
  return (
    <div
      className="relative"
      title="Rune Deck is fixed during sideboarding"
    >
      <CardFace card={group.card} />
      <span className="absolute right-1 top-1 rounded bg-slate-950/90 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-100">
        x{group.quantity}
      </span>
    </div>
  );
}

function BattlefieldFace({
  battlefield,
}: {
  battlefield: SideboardingViewModel["battlefields"][number];
}) {
  return (
    <article className="overflow-hidden rounded-md border border-white/10 bg-slate-950/70">
      <div className="relative">
        <CardFace card={battlefield.card} landscape />
        <span className="absolute left-1 top-1 rounded bg-slate-950/90 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-100">
          {formatBattlefieldStatus(battlefield.status)}
        </span>
      </div>
      {battlefield.card.rulesText.trim() && (
        <p className="px-2 py-1.5 text-center text-[10px] leading-4 text-slate-300">
          {battlefield.card.rulesText}
        </p>
      )}
    </article>
  );
}

function formatBattlefieldStatus(
  status: SideboardingViewModel["battlefields"][number]["status"],
) {
  if (status === "auto-selected") return "Auto";
  if (status === "used") return "Used";
  return "Available";
}
