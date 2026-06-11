import { CircleDot, Swords, Timer, Zap } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { Card } from "@/server/catalog";

type BoardPreviewProps = {
  annieLegend: Card;
  luxLegend: Card;
  annieChampion: Card;
  luxChampion: Card;
  battlefield: Card;
};

export function BoardPreview({
  annieLegend,
  luxLegend,
  annieChampion,
  luxChampion,
  battlefield
}: BoardPreviewProps) {
  return (
    <main className="min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="relative min-h-screen bg-[radial-gradient(circle_at_55%_20%,rgba(147,51,234,0.38),transparent_34%),radial-gradient(circle_at_30%_65%,rgba(14,165,233,0.24),transparent_32%),linear-gradient(135deg,#12051f_0%,#182034_46%,#080b12_100%)]">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:72px_72px] opacity-30" />
        <section className="relative grid min-h-screen grid-rows-[1fr_auto_1fr] gap-3 p-4">
          <PlayerBand
            label="Opponent"
            score={0}
            deckCount={40}
            legend={luxLegend}
            champion={luxChampion}
            align="top"
          />

          <section className="grid grid-cols-[180px_1fr_180px] items-center gap-4">
            <ZoneStack title="Chain" subtitle="empty" icon={<Zap className="size-4" />} />
            <div className="rounded-lg border border-cyan-200/20 bg-slate-950/45 p-4 shadow-2xl shadow-cyan-950/30 backdrop-blur">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-cyan-100">
                  <Swords className="size-4" />
                  Battlefield
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <Timer className="size-4" />
                  Neutral Open
                </div>
              </div>
              <div className="grid min-h-48 grid-cols-[1fr_160px_1fr] items-center gap-4">
                <BoardLane title="Annie Base" />
                <CardImage card={battlefield} className="mx-auto w-36 rotate-0" />
                <BoardLane title="Lux Base" />
              </div>
            </div>
            <ZoneStack title="Log" subtitle="setup pending" icon={<CircleDot className="size-4" />} />
          </section>

          <PlayerBand
            label="You"
            score={0}
            deckCount={40}
            legend={annieLegend}
            champion={annieChampion}
            align="bottom"
          />
        </section>
      </div>
    </main>
  );
}

function PlayerBand({
  label,
  score,
  deckCount,
  legend,
  champion,
  align
}: {
  label: string;
  score: number;
  deckCount: number;
  legend: Card;
  champion: Card;
  align: "top" | "bottom";
}) {
  return (
    <section className="grid grid-cols-[220px_1fr_260px] items-center gap-4 rounded-lg border border-white/10 bg-slate-950/45 p-4 backdrop-blur">
      <div className="space-y-3">
        <div className="text-sm font-semibold text-slate-300">{label}</div>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Score" value={score} />
          <Stat label="Deck" value={deckCount} />
        </div>
      </div>
      <div className="flex min-h-40 items-center justify-center rounded-md border border-dashed border-white/15 bg-black/20 text-sm text-slate-400">
        {align === "top" ? "Opponent board projection" : "Your board projection"}
      </div>
      <div className="flex items-center justify-end gap-3">
        <CardImage card={legend} className="w-24" />
        <CardImage card={champion} className="w-24" />
      </div>
    </section>
  );
}

function BoardLane({ title }: { title: string }) {
  return (
    <div className="flex min-h-36 items-center justify-center rounded-md border border-dashed border-white/15 bg-black/20 text-sm text-slate-400">
      {title}
    </div>
  );
}

function ZoneStack({
  title,
  subtitle,
  icon
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-950/55 p-4 backdrop-blur">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-100">
        {icon}
        {title}
      </div>
      <p className="text-xs text-slate-400">{subtitle}</p>
      <Button className="mt-4 w-full" size="sm" variant="secondary">
        Inspect
      </Button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-white/10 bg-black/25 p-3">
      <div className="text-xs uppercase text-slate-400">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}

function CardImage({ card, className }: { card: Card; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- MVP intentionally renders set media.image_url directly.
    <img
      alt={card.media.accessibility_text ?? card.name}
      className={`rounded-md border border-white/15 shadow-xl shadow-black/50 ${className ?? ""}`}
      src={card.media.image_url ?? ""}
    />
  );
}
