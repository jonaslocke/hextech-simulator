import { ShieldCheck } from "lucide-react";

export function SideboardingWaitingState({
  opponentSubmitted,
}: {
  opponentSubmitted: boolean;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 p-5 text-slate-100 tabletop-background">
      <section className="grid w-full max-w-md gap-3 rounded-xl border border-cyan-300/20 bg-slate-950/95 p-5 text-center shadow-2xl">
        <ShieldCheck className="mx-auto h-8 w-8 text-cyan-200" />
        <h1 className="font-semibold text-xl">Sideboard submitted</h1>
        <p className="text-slate-400 text-sm">
          {opponentSubmitted
            ? "Both players are submitted. Preparing the next setup."
            : "Waiting for the opponent to submit."}
        </p>
      </section>
    </main>
  );
}
