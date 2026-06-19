"use client";

import { useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FileJson,
  ListChecks,
  Upload
} from "lucide-react";
import { Button } from "@/shared/components/button";
import { previewCardCatalogUpload } from "../api";
import type { CardCatalogPreviewResponse } from "../types";

type Preview = Extract<CardCatalogPreviewResponse, { accepted: true }>["preview"];
type PreviewCard = Preview["cards"][number];

const SUPPORT_STYLES: Record<string, string> = {
  supported: "border-emerald-400/30 bg-emerald-400/10 text-emerald-100",
  partially_supported: "border-sky-400/30 bg-sky-400/10 text-sky-100",
  requires_engine_support: "border-amber-400/30 bg-amber-400/10 text-amber-100",
  ambiguous: "border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-100",
  unsupported: "border-red-400/30 bg-red-400/10 text-red-100",
  vanilla: "border-slate-500/30 bg-slate-500/10 text-slate-200"
};

const EXISTING_STATE_STYLES: Record<string, string> = {
  new: "border-cyan-400/30 bg-cyan-400/10 text-cyan-100",
  already_persisted: "border-emerald-400/30 bg-emerald-400/10 text-emerald-100",
  changed_since_persisted: "border-amber-400/30 bg-amber-400/10 text-amber-100"
};

export function CardCatalogImportPreview() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const sortedCards = useMemo(
    () =>
      [...(preview?.cards ?? [])].sort((left, right) =>
        left.cardCode.localeCompare(right.cardCode)
      ),
    [preview]
  );

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    setSelectedFile(event.target.files?.[0] ?? null);
    setError(null);
  }

  async function uploadSelectedFile() {
    if (!selectedFile) {
      setError("Select a JSON file first.");
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const response = await previewCardCatalogUpload(selectedFile);

      if (!response.accepted) {
        setError(
          [response.error.message, ...(response.error.details ?? [])].join(" ")
        );
        return;
      }

      setPreview(response.preview);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <main className="bg-slate-950 min-h-screen text-slate-100">
      <div className="mx-auto px-5 py-8 max-w-[1400px]">
        <header className="flex md:flex-row flex-col md:justify-between md:items-end gap-5 pb-5 border-white/10 border-b">
          <div>
            <h1 className="font-semibold text-2xl">Card Catalog Import</h1>
            <p className="mt-1 text-slate-400 text-sm">
              Upload a set JSON to generate an ephemeral validation preview.
            </p>
          </div>
          <div className="flex sm:flex-row flex-col gap-3">
            <label className="inline-flex justify-center items-center gap-2 bg-slate-900 hover:bg-slate-800 px-4 py-2 border border-white/10 rounded-md min-h-10 text-sm cursor-pointer">
              <FileJson className="size-4" aria-hidden="true" />
              <span className="max-w-52 truncate">
                {selectedFile?.name ?? "Choose JSON"}
              </span>
              <input
                accept="application/json,.json"
                className="sr-only"
                onChange={selectFile}
                type="file"
              />
            </label>
            <Button
              disabled={isUploading || !selectedFile}
              onClick={uploadSelectedFile}
              type="button"
            >
              <Upload className="size-4" aria-hidden="true" />
              {isUploading ? "Analyzing..." : "Analyze"}
            </Button>
          </div>
        </header>

        {error && (
          <div className="flex items-start gap-3 bg-red-950/40 mt-5 px-4 py-3 border border-red-400/30 rounded-lg text-red-100 text-sm">
            <AlertTriangle className="flex-none mt-0.5 size-4" aria-hidden="true" />
            <p>{error}</p>
          </div>
        )}

        {preview ? (
          <>
            <SummaryBand preview={preview} />
            <CardTable cards={sortedCards} />
          </>
        ) : (
          <section className="mt-6 py-16 border border-dashed border-white/15 rounded-lg text-center">
            <FileJson className="mx-auto size-8 text-slate-500" aria-hidden="true" />
            <p className="mt-3 text-slate-300">No import preview loaded.</p>
          </section>
        )}
      </div>
    </main>
  );
}

function SummaryBand({ preview }: { preview: Preview }) {
  return (
    <section className="gap-3 grid sm:grid-cols-2 lg:grid-cols-5 mt-6">
      <Metric
        icon={<FileJson className="size-4" aria-hidden="true" />}
        label="Uploaded"
        value={preview.summary.uploadedCardCount}
      />
      <Metric
        icon={<ListChecks className="size-4" aria-hidden="true" />}
        label="Suggestions"
        value={preview.summary.suggestedCardCount}
      />
      <Metric
        icon={<CheckCircle2 className="size-4" aria-hidden="true" />}
        label="Already Persisted"
        value={preview.summary.alreadyPersistedCardCount}
      />
      <Metric
        icon={<AlertTriangle className="size-4" aria-hidden="true" />}
        label="Needs Support"
        value={preview.summary.requiresEngineSupportCardCount}
      />
      <Metric
        icon={<Database className="size-4" aria-hidden="true" />}
        label="Changed"
        value={preview.summary.changedSincePersistedCardCount}
      />
    </section>
  );
}

function Metric({
  icon,
  label,
  value
}: {
  icon: ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="bg-slate-900/80 p-4 border border-white/10 rounded-lg">
      <div className="flex items-center gap-2 text-slate-400 text-xs uppercase tracking-wide">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-3 font-semibold text-2xl">{value}</p>
    </div>
  );
}

function CardTable({ cards }: { cards: PreviewCard[] }) {
  return (
    <section className="mt-5 border border-white/10 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-sm">
          <thead className="bg-slate-900 text-slate-400 text-xs uppercase">
            <tr>
              <th className="px-4 py-3 w-40 text-left font-medium">Card</th>
              <th className="px-4 py-3 text-left font-medium">Rules Text</th>
              <th className="px-4 py-3 w-48 text-left font-medium">Catalog</th>
              <th className="px-4 py-3 w-52 text-left font-medium">Status</th>
              <th className="px-4 py-3 w-80 text-left font-medium">Primitives</th>
            </tr>
          </thead>
          <tbody>
            {cards.map((card) => (
              <tr className="border-white/10 border-t align-top" key={card.publicCode}>
                <td className="px-4 py-4">
                  <p className="font-mono text-cyan-200 text-xs">{card.cardCode}</p>
                  <p className="mt-1 font-semibold">{card.name}</p>
                  <p className="mt-1 text-slate-500 text-xs">{card.type}</p>
                </td>
                <td className="px-4 py-4 max-w-xl">
                  <p className="text-slate-200 leading-relaxed">
                    {card.rulesText || "No rules text."}
                  </p>
                </td>
                <td className="px-4 py-4">
                  <Badge
                    className={EXISTING_STATE_STYLES[card.existingCatalog.state]}
                    value={formatStatus(card.existingCatalog.state)}
                  />
                  {card.existingCatalog.persisted?.status && (
                    <p className="mt-2 text-slate-500 text-xs">
                      {formatStatus(card.existingCatalog.persisted.status)}
                    </p>
                  )}
                </td>
                <td className="px-4 py-4">
                  <Badge
                    className={SUPPORT_STYLES[readSupportStatus(card)]}
                    value={formatStatus(readSupportStatus(card))}
                  />
                  {card.suggestion?.missingRequiredParameterCount ? (
                    <p className="mt-2 text-amber-200 text-xs">
                      {card.suggestion.missingRequiredParameterCount} missing params
                    </p>
                  ) : null}
                </td>
                <td className="px-4 py-4">
                  <div className="flex flex-wrap gap-1.5">
                    {(card.suggestion?.primitiveIds ?? ["vanilla"]).map((primitiveId) => (
                      <span
                        className="bg-white/5 px-2 py-1 border border-white/10 rounded font-mono text-[11px] text-slate-300"
                        key={primitiveId}
                      >
                        {primitiveId}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Badge({ className, value }: { className?: string; value: string }) {
  return (
    <span className={`inline-flex px-2 py-1 border rounded text-xs ${className ?? ""}`}>
      {value}
    </span>
  );
}

function readSupportStatus(card: PreviewCard): string {
  return card.isVanilla ? "vanilla" : card.suggestion?.supportStatus ?? "unsupported";
}

function formatStatus(status: string): string {
  return status.replaceAll("_", " ");
}
