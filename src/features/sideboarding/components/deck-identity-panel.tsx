import type { SideboardingViewModel } from "../sideboarding-view-model";
import { CardFace } from "./card-face";

export function DeckIdentityPanel({
  viewModel,
}: {
  viewModel: SideboardingViewModel;
}) {
  // return (
  //   <section className="flex">
  //     <IdentityCard label="Legend" card={viewModel.legend} />
  //     <IdentityCard
  //       card={viewModel.chosenChampion}
  //       changed={viewModel.changedChosenChampion}
  //       label="Champion"
  //     />
  //     <div className="flex flex-col gap-2">
  //       <HeaderLabel label="Battlefields" />
  //       <div className="flex">
  //         {viewModel.battlefields.map((battlefield) => (
  //           <div className="relative" key={battlefield.registeredCardId}>
  //             <HeaderCardFace card={battlefield.card} landscape />
  //             <span className="top-2 left-2 absolute bg-slate-950/85 px-1.5 py-0.5 rounded font-semibold text-[10px] text-cyan-100">
  //               {formatBattlefieldStatus(battlefield.status)}
  //             </span>
  //           </div>
  //         ))}
  //       </div>
  //     </div>
  //   </section>
  // );
  return (
    <section className="gap-8 grid lg:grid-cols-[8.6rem_9.6rem_minmax(0,1fr)_5.8rem] bg-slate-950/70 px-3 py-2.5 border-white/10 border-b text-slate-100">
      <IdentityCard label="Legend" card={viewModel.legend} />
      <IdentityCard
        card={viewModel.chosenChampion}
        changed={viewModel.changedChosenChampion}
        label="Chosen Champion"
      />
      <div className="min-w-0">
        <p className="mb-2 font-semibold text-[10px] text-slate-400 uppercase tracking-widest">
          Battlefields
        </p>
        <div className="flex justify-center gap-4">
          {viewModel.battlefields.map((battlefield) => (
            <div className="relative" key={battlefield.registeredCardId}>
              <CardFace card={battlefield.card} landscape className="h-50" />
              <span className="top-1 left-1 absolute bg-slate-950/85 px-1.5 py-0.5 rounded font-semibold text-[10px] text-cyan-100">
                {formatBattlefieldStatus(battlefield.status)}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-white/5 p-2 border border-white/10 rounded-md text-sm">
        <p className="font-semibold text-[10px] text-slate-400 uppercase tracking-widest">
          Runes
        </p>
        <div className="gap-2 grid mt-2">
          {viewModel.runeGroups.map((group) => (
            <div
              className="relative mx-auto w-full max-w-[4.25rem]"
              key={`rune:${group.canonicalName}`}
              title="Rune Deck is fixed during sideboarding"
            >
              <CardFace card={group.card} />
              <span className="top-1 right-1 absolute bg-slate-950/90 px-1.5 py-0.5 rounded font-semibold text-[10px] text-cyan-100">
                x{group.quantity}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HeaderCardFace({
  card,
  landscape = false,
}: {
  card: SideboardingViewModel["legend"];
  landscape?: boolean;
}) {
  return <CardFace card={card} landscape={landscape} className="h-48" />;
}

function HeaderLabel({ label }: { label: string }) {
  return (
    <p className="font-semibold text-[10px] text-slate-400 uppercase tracking-[0.14em] whitespace-nowrap">
      {label}
    </p>
  );
}

function IdentityCard({
  card,
  changed = false,
  label,
}: {
  card: SideboardingViewModel["legend"];
  changed?: boolean;
  label: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2 min-w-0 h-4">
        <HeaderLabel label={label} />
        {changed && (
          <span className="bg-amber-300/10 px-1 py-0 border border-amber-300/40 rounded font-semibold text-[8px] text-amber-100 uppercase tracking-normal shrink-0">
            Changed
          </span>
        )}
      </div>
      <HeaderCardFace card={card} />
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
