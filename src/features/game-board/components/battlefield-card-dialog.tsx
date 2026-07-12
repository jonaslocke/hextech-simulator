"use client";

import { CardRulesText } from "@/features/card-presentation";
import { X } from "lucide-react";
import { createPortal } from "react-dom";

export function BattlefieldCardDialog({
  contestedByPlayerId = null,
  controllerPlayerId = null,
  description,
  img,
  name,
  onClose,
}: {
  contestedByPlayerId?: string | null;
  controllerPlayerId?: string | null;
  description: string;
  img: string;
  name: string;
  onClose: () => void;
}) {
  if (typeof document === "undefined") return null;

  const controlLabel = contestedByPlayerId
    ? `Contested by ${contestedByPlayerId}`
    : controllerPlayerId
      ? `Controlled by ${controllerPlayerId}`
      : "Uncontrolled";

  return createPortal(
    <div
      aria-label={`${name} battlefield details`}
      aria-modal="true"
      className="z-[2147483647] fixed inset-0 flex justify-center items-center bg-slate-950/72 supports-backdrop-filter:bg-slate-950/52 p-4 supports-backdrop-filter:backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
    >
      <section
        className="relative grid w-[min(50rem,calc(100vw-2rem))] max-h-[min(34rem,calc(100vh-2rem))] gap-3 overflow-auto rounded-xl border border-cyan-100/20 bg-slate-950 p-3 shadow-2xl shadow-black/80 md:grid-cols-[minmax(0,1.35fr)_minmax(15rem,0.8fr)]"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          aria-label={`Close ${name} details`}
          className="top-2 right-2 z-10 absolute flex size-8 items-center justify-center rounded-md border border-white/15 bg-slate-950/80 text-slate-300 transition hover:border-cyan-200/50 hover:text-white focus-visible:outline focus-visible:outline-cyan-200"
          onClick={onClose}
          type="button"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
        <div className="rounded-lg border border-white/10 bg-white/[0.035] p-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- Battlefield art comes from the catalog. */}
          <img alt={name} className="block aspect-1038/744 w-full rounded-md object-contain" src={img} />
        </div>
        <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.035] p-4">
          <div className="pr-8">
            <p className="text-xs uppercase tracking-wide text-slate-400">Battlefield</p>
            <h2 className="mt-1 text-lg font-semibold leading-tight text-slate-50">{name}</h2>
          </div>
          <span className="w-fit rounded-full border border-amber-200/25 bg-amber-300/10 px-2 py-1 text-xs text-amber-100">{controlLabel}</span>
          <div className="rounded-md border border-white/10 bg-slate-950/55 p-3 text-sm leading-relaxed text-slate-100">
            <CardRulesText text={description} />
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}
