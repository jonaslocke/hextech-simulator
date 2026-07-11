import type { SideboardingViewModel } from "../sideboarding-view-model";
import { CardFace } from "./card-face";

export function DeckIdentityPanel({
  viewModel,
}: {
  viewModel: SideboardingViewModel;
}) {
  return (
    <section className="grid gap-3 border-white/10 border-b bg-slate-950/70 px-4 py-3 text-slate-100 lg:grid-cols-[9rem_9rem_1fr_auto]">
      <IdentityCard label="Legend" card={viewModel.legend} />
      <IdentityCard
        card={viewModel.chosenChampion}
        label={
          viewModel.changedChosenChampion ? "Chosen Champion changed" : "Chosen Champion"
        }
      />
      <div className="min-w-0">
        <p className="mb-2 font-semibold text-slate-400 text-[10px] uppercase tracking-widest">
          Battlefields
        </p>
        <div className="grid grid-cols-3 gap-2">
          {viewModel.battlefields.map((battlefield) => (
            <div className="relative" key={battlefield.registeredCardId}>
              <CardFace card={battlefield.card} landscape />
              <span className="absolute left-1 top-1 rounded bg-slate-950/85 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-100">
                {formatBattlefieldStatus(battlefield.status)}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-md border border-white/10 bg-white/5 p-3 text-sm">
        <p className="font-semibold text-slate-400 text-[10px] uppercase tracking-widest">
          Rune Deck
        </p>
        <p className="mt-2 font-semibold text-cyan-100">12 fixed Runes</p>
        <p className="mt-1 max-w-52 text-slate-400 text-xs">
          Runes stay registered and are revalidated against the selected Chosen
          Champion.
        </p>
      </div>
    </section>
  );
}

function IdentityCard({
  card,
  label,
}: {
  card: SideboardingViewModel["legend"];
  label: string;
}) {
  return (
    <div>
      <p className="mb-2 font-semibold text-slate-400 text-[10px] uppercase tracking-widest">
        {label}
      </p>
      <CardFace card={card} />
    </div>
  );
}

function formatBattlefieldStatus(
  status: SideboardingViewModel["battlefields"][number]["status"],
) {
  if (status === "auto-selected") return "Auto";
  if (status === "used") return "Used";
  return "Available";
}
