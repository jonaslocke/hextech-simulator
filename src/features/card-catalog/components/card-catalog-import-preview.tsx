"use client";

import {
  useMemo,
  useState,
  type ChangeEvent,
  type ReactNode
} from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronsUpDown,
  Database,
  FileJson,
  ListChecks,
  Plus,
  Save,
  Trash2,
  Upload
} from "lucide-react";
import { CardRulesText } from "@/features/card-presentation";
import { Button } from "@/shared/components/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from "@/shared/components/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/shared/components/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/shared/components/select";
import { cn } from "@/shared/utils/cn";
import {
  approveCardCatalogBehavior,
  previewCardCatalogUpload
} from "../api";
import type {
  CardCatalogApprovalRequest,
  CardCatalogPreviewResponse
} from "../types";

type Preview = Extract<CardCatalogPreviewResponse, { accepted: true }>["preview"];
type PreviewCard = Preview["cards"][number];
type PrimitiveCatalogEntry = Preview["primitiveCatalog"][number];
type EditableClause = CardCatalogApprovalRequest["clauses"][number];
type EditableAssignment = EditableClause["assignments"][number];
type ModelingStatus = "approved" | "rejected";

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
  const [reviewCardCode, setReviewCardCode] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, ReviewDraft>>({});
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [savingCardCode, setSavingCardCode] = useState<string | null>(null);
  const primitiveCatalogById = useMemo(
    () =>
      new Map((preview?.primitiveCatalog ?? []).map((entry) => [entry.id, entry])),
    [preview]
  );
  const sortedCards = useMemo(
    () =>
      [...(preview?.cards ?? [])].sort((left, right) =>
        left.cardCode.localeCompare(right.cardCode)
      ),
    [preview]
  );
  const reviewCard = sortedCards.find((card) => card.cardCode === reviewCardCode);

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
      setDrafts({});
      setReviewCardCode(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  }

  function reviewCardForApproval(card: PreviewCard) {
    setDrafts((current) => ({
      ...current,
      [card.cardCode]: current[card.cardCode] ?? createReviewDraft(card)
    }));
    setReviewCardCode(card.cardCode);
    setError(null);
  }

  async function saveReview(card: PreviewCard) {
    const draft = drafts[card.cardCode] ?? createReviewDraft(card);

    setSavingCardCode(card.cardCode);
    setError(null);

    try {
      const response = await approveCardCatalogBehavior({
        cardCode: card.cardCode,
        card: card.card,
        sourceTextHash: card.sourceTextHash,
        modelingStatus: "approved",
        clauses: draft.clauses,
        adminNotes: draft.adminNotes
      });

      if (!response.accepted) {
        setError(
          [response.error.message, ...(response.error.details ?? [])].join(" ")
        );
        return;
      }

      setPreview((current) =>
        current ? markCardPersisted(current, card, response.behavior) : current
      );
      setReviewCardCode(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Approval failed.");
    } finally {
      setSavingCardCode(null);
    }
  }

  function updateDraft(cardCode: string, updater: (draft: ReviewDraft) => ReviewDraft) {
    const card = sortedCards.find((candidate) => candidate.cardCode === cardCode);

    if (!card) {
      return;
    }

    setDrafts((current) => ({
      ...current,
      [cardCode]: updater(current[cardCode] ?? createReviewDraft(card))
    }));
  }

  return (
    <main className="bg-slate-950 min-h-screen text-slate-100">
      <div className="mx-auto px-5 py-8 max-w-[1480px]">
        <header className="flex md:flex-row flex-col md:justify-between md:items-end gap-5 pb-5 border-white/10 border-b">
          <div>
            <h1 className="font-semibold text-2xl">Card Catalog Import</h1>
            <p className="mt-1 text-slate-400 text-sm">
              Upload a set JSON, review suggested behaviors, and persist approved cards.
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
            <CardTable
              cards={sortedCards}
              onReview={reviewCardForApproval}
              reviewCardCode={reviewCardCode}
            />
            {reviewCard && (
              <ReviewModal card={reviewCard} onClose={() => setReviewCardCode(null)}>
                <ReviewPanel
                  card={reviewCard}
                  draft={drafts[reviewCard.cardCode] ?? createReviewDraft(reviewCard)}
                  isSaving={savingCardCode === reviewCard.cardCode}
                  onAddClause={() =>
                    updateDraft(reviewCard.cardCode, (draft) => addManualClause(draft))
                  }
                  onAddPrimitive={(clauseId, primitiveId) =>
                    updateDraft(reviewCard.cardCode, (draft) =>
                      addPrimitiveToClause(
                        draft,
                        clauseId,
                        primitiveId,
                        primitiveCatalogById
                      )
                    )
                  }
                  onChangeAdminNotes={(adminNotes) =>
                    updateDraft(reviewCard.cardCode, (draft) => ({
                      ...draft,
                      adminNotes
                    }))
                  }
                  onChangeParameter={(clauseId, assignmentIndex, parameterName, value) =>
                    updateDraft(reviewCard.cardCode, (draft) =>
                      updateAssignmentParameter({
                        assignmentIndex,
                        clauseId,
                        draft,
                        parameterName,
                        primitiveCatalogById,
                        value
                      })
                    )
                  }
                  onChangeClauseSourceText={(clauseId, sourceText) =>
                    updateDraft(reviewCard.cardCode, (draft) =>
                      updateClauseSourceText(draft, clauseId, sourceText)
                    )
                  }
                  onChangeModelingStatus={(modelingStatus) =>
                    updateDraft(reviewCard.cardCode, (draft) => ({
                      ...draft,
                      modelingStatus
                    }))
                  }
                  onClose={() => setReviewCardCode(null)}
                  onRemovePrimitive={(clauseId, assignmentIndex) =>
                    updateDraft(reviewCard.cardCode, (draft) =>
                      removePrimitiveFromClause(draft, clauseId, assignmentIndex)
                    )
                  }
                  onSave={() => saveReview(reviewCard)}
                  primitiveCatalog={preview.primitiveCatalog}
                  primitiveCatalogById={primitiveCatalogById}
                />
              </ReviewModal>
            )}
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

type ReviewDraft = {
  modelingStatus: ModelingStatus;
  adminNotes: string;
  clauses: EditableClause[];
};

function createReviewDraft(card: PreviewCard): ReviewDraft {
  return {
    modelingStatus: isCardModelingComplete(card) ? "approved" : "rejected",
    adminNotes: "",
    clauses:
      card.suggestion?.clauses.map((clause) => ({
        id: clause.id,
        sourceText: clause.sourceText,
        normalizedText: clause.normalizedText,
        unsupportedReason: clause.unsupportedReason,
        assignments: clause.assignments.map((assignment) => ({
          primitiveId: assignment.assignment.primitiveId,
          family: assignment.assignment.family,
          sourceText: assignment.assignment.sourceText,
          parameters: assignment.assignment.parameters,
          confidence: assignment.assignment.confidence
        }))
      })) ?? []
  };
}

function markCardPersisted(
  preview: Preview,
  card: PreviewCard,
  persisted: NonNullable<PreviewCard["existingCatalog"]["persisted"]>
): Preview {
  const previousState = card.existingCatalog.state;
  const nextCards = preview.cards.map((candidate) =>
    candidate.cardCode === card.cardCode
      ? {
          ...candidate,
          existingCatalog: {
            state: "already_persisted" as const,
            persisted: {
              cardCode: persisted.cardCode,
              modelingStatus: persisted.modelingStatus,
              runtimeSupportStatus: persisted.runtimeSupportStatus,
              sourceTextHash: persisted.sourceTextHash,
              updatedAt: persisted.updatedAt
            }
          }
        }
      : candidate
  );

  return {
    ...preview,
    summary: {
      ...preview.summary,
      newCardCount:
        previousState === "new"
          ? Math.max(0, preview.summary.newCardCount - 1)
          : preview.summary.newCardCount,
      alreadyPersistedCardCount:
        previousState === "already_persisted"
          ? preview.summary.alreadyPersistedCardCount
          : preview.summary.alreadyPersistedCardCount + 1,
      changedSincePersistedCardCount:
        previousState === "changed_since_persisted"
          ? Math.max(0, preview.summary.changedSincePersistedCardCount - 1)
          : preview.summary.changedSincePersistedCardCount
    },
    cards: nextCards
  };
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

function CardTable({
  cards,
  onReview,
  reviewCardCode
}: {
  cards: PreviewCard[];
  onReview(card: PreviewCard): void;
  reviewCardCode: string | null;
}) {
  return (
    <section className="mt-5 border border-white/10 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] border-collapse text-sm">
          <thead className="bg-slate-900 text-slate-400 text-xs uppercase">
            <tr>
              <th className="px-4 py-3 w-40 text-left font-medium">Card</th>
              <th className="px-4 py-3 text-left font-medium">Rules Text</th>
              <th className="px-4 py-3 w-44 text-left font-medium">Catalog</th>
              <th className="px-4 py-3 w-44 text-left font-medium">Status</th>
              <th className="px-4 py-3 w-72 text-left font-medium">Primitives</th>
              <th className="px-4 py-3 w-32 text-left font-medium">Actions</th>
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
                  <div className="grid gap-1.5 text-slate-200 leading-relaxed">
                    {card.rulesText?.trim() ? (
                      <CardRulesText text={card.rulesText} />
                    ) : (
                      <p>No rules text.</p>
                    )}
                  </div>
                </td>
                <td className="px-4 py-4">
                  <Badge
                    className={EXISTING_STATE_STYLES[card.existingCatalog.state]}
                    value={formatStatus(card.existingCatalog.state)}
                  />
                  {card.existingCatalog.persisted?.modelingStatus && (
                    <p className="mt-2 text-slate-500 text-xs">
                      {formatStatus(card.existingCatalog.persisted.modelingStatus)} modeling
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
                  <PrimitiveChips primitiveIds={card.suggestion?.primitiveIds ?? ["vanilla"]} />
                </td>
                <td className="px-4 py-4">
                  <Button
                    onClick={() => onReview(card)}
                    size="sm"
                    type="button"
                    variant={reviewCardCode === card.cardCode ? "default" : "secondary"}
                  >
                    Review
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ReviewModal({
  card,
  children,
  onClose
}: {
  card: PreviewCard;
  children: ReactNode;
  onClose(): void;
}) {
  return (
    <div
      aria-labelledby="card-catalog-review-title"
      aria-modal="true"
      className="z-50 fixed inset-0 flex justify-center items-start p-4 sm:p-6 overflow-y-auto"
      role="dialog"
    >
      <button
        aria-label={`Close review for ${card.name}`}
        className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm"
        onClick={onClose}
        type="button"
      />
      <div className="relative w-full max-w-[1280px] shadow-2xl shadow-cyan-950/40">
        {children}
      </div>
    </div>
  );
}

function ReviewPanel({
  card,
  draft,
  isSaving,
  onAddClause,
  onAddPrimitive,
  onChangeAdminNotes,
  onChangeClauseSourceText,
  onChangeParameter,
  onChangeModelingStatus,
  onClose,
  onRemovePrimitive,
  onSave,
  primitiveCatalog,
  primitiveCatalogById
}: {
  card: PreviewCard;
  draft: ReviewDraft;
  isSaving: boolean;
  onAddClause(): void;
  onAddPrimitive(clauseId: string, primitiveId: string): void;
  onChangeAdminNotes(value: string): void;
  onChangeClauseSourceText(clauseId: string, value: string): void;
  onChangeParameter(
    clauseId: string,
    assignmentIndex: number,
    parameterName: string,
    value: string
  ): void;
  onChangeModelingStatus(status: ModelingStatus): void;
  onClose(): void;
  onRemovePrimitive(clauseId: string, assignmentIndex: number): void;
  onSave(): void;
  primitiveCatalog: PrimitiveCatalogEntry[];
  primitiveCatalogById: Map<string, PrimitiveCatalogEntry>;
}) {
  return (
    <section className="bg-slate-900 p-5 border border-cyan-400/20 rounded-lg">
      <div className="flex md:flex-row flex-col md:justify-between gap-4">
        <div>
          <p className="font-mono text-cyan-200 text-xs">{card.cardCode}</p>
          <h2 className="mt-1 font-semibold text-xl" id="card-catalog-review-title">
            {card.name}
          </h2>
          <div className="grid gap-1.5 mt-2 max-w-3xl text-slate-300 text-sm leading-relaxed">
            {card.rulesText?.trim() ? (
              <CardRulesText text={card.rulesText} />
            ) : (
              <p>No rules text.</p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 h-fit">
          <Badge
            className={SUPPORT_STYLES[readSupportStatus(card)]}
            value={`runtime: ${formatStatus(readSupportStatus(card))}`}
          />
          <select
            className="bg-slate-950 px-3 py-2 border border-white/15 rounded-md text-sm"
            onChange={(event) =>
              onChangeModelingStatus(event.target.value as ModelingStatus)
            }
            value={draft.modelingStatus}
          >
            <option value="approved">approved</option>
            <option value="rejected">rejected</option>
          </select>
          <Button
            disabled={isSaving || draft.modelingStatus !== "approved"}
            onClick={onSave}
            type="button"
          >
            <Save className="size-4" aria-hidden="true" />
            {isSaving ? "Publishing..." : "Publish"}
          </Button>
          <Button onClick={onClose} type="button" variant="secondary">
            Close
          </Button>
        </div>
      </div>

      <div className="gap-4 grid lg:grid-cols-[1fr_320px] mt-5">
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={onAddClause} size="sm" type="button" variant="secondary">
              <Plus className="size-4" aria-hidden="true" />
              Add behavior clause
            </Button>
          </div>
          {draft.clauses.length === 0 ? (
            <div className="bg-slate-950/70 p-4 border border-white/10 rounded-lg">
              <p className="text-slate-300 text-sm">
                No behavior clauses assigned yet.
              </p>
            </div>
          ) : (
            draft.clauses.map((clause) => (
              <ClauseEditor
                clause={clause}
                key={clause.id}
                onAddPrimitive={onAddPrimitive}
                onChangeSourceText={onChangeClauseSourceText}
                onChangeParameter={onChangeParameter}
                onRemovePrimitive={onRemovePrimitive}
                primitiveCatalog={primitiveCatalog}
                primitiveCatalogById={primitiveCatalogById}
              />
            ))
          )}
        </div>

        <aside className="bg-slate-950/70 p-4 border border-white/10 rounded-lg h-fit">
          <label className="block text-slate-400 text-xs uppercase tracking-wide">
            Admin Notes
          </label>
          <textarea
            className="bg-slate-950 mt-2 p-3 border border-white/15 rounded-md w-full min-h-36 text-sm"
            onChange={(event) => onChangeAdminNotes(event.target.value)}
            value={draft.adminNotes}
          />
        </aside>
      </div>
    </section>
  );
}

function ClauseEditor({
  clause,
  onAddPrimitive,
  onChangeSourceText,
  onChangeParameter,
  onRemovePrimitive,
  primitiveCatalog,
  primitiveCatalogById
}: {
  clause: EditableClause;
  onAddPrimitive(clauseId: string, primitiveId: string): void;
  onChangeSourceText(clauseId: string, value: string): void;
  onChangeParameter(
    clauseId: string,
    assignmentIndex: number,
    parameterName: string,
    value: string
  ): void;
  onRemovePrimitive(clauseId: string, assignmentIndex: number): void;
  primitiveCatalog: PrimitiveCatalogEntry[];
  primitiveCatalogById: Map<string, PrimitiveCatalogEntry>;
}) {
  const [selectedPrimitiveId, setSelectedPrimitiveId] = useState(
    primitiveCatalog[0]?.id ?? ""
  );

  return (
    <div className="bg-slate-950/70 p-4 border border-white/10 rounded-lg">
      <div className="flex md:flex-row flex-col md:justify-between gap-3">
        <div>
          <p className="font-mono text-slate-500 text-xs">{clause.id}</p>
          <label className="block mt-2">
            <span className="text-slate-400 text-xs uppercase tracking-wide">
              Clause Source
            </span>
            <input
              className="bg-slate-900 mt-1 px-2 py-2 border border-white/15 rounded-md w-full min-w-80 text-sm"
              onChange={(event) => onChangeSourceText(clause.id, event.target.value)}
              value={clause.sourceText}
            />
          </label>
          {clause.unsupportedReason && (
            <p className="mt-2 text-amber-200 text-xs">{clause.unsupportedReason}</p>
          )}
        </div>
        <div className="flex gap-2 h-fit">
          <PrimitiveCombobox
            onChange={setSelectedPrimitiveId}
            primitives={primitiveCatalog}
            value={selectedPrimitiveId}
          />
          <Button
            disabled={!selectedPrimitiveId}
            onClick={() => onAddPrimitive(clause.id, selectedPrimitiveId)}
            size="sm"
            type="button"
            variant="secondary"
          >
            <Plus className="size-4" aria-hidden="true" />
            Add
          </Button>
        </div>
      </div>

      <div className="space-y-3 mt-4">
        {clause.assignments.map((assignment, assignmentIndex) => (
          <PrimitiveEditor
            assignment={assignment}
            assignmentIndex={assignmentIndex}
            clauseId={clause.id}
            key={`${assignment.primitiveId}:${assignmentIndex}`}
            onChangeParameter={onChangeParameter}
            onRemovePrimitive={onRemovePrimitive}
            primitiveCatalogById={primitiveCatalogById}
          />
        ))}
      </div>
    </div>
  );
}

function PrimitiveCombobox({
  onChange,
  primitives,
  value
}: {
  onChange(value: string): void;
  primitives: PrimitiveCatalogEntry[];
  value: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedPrimitive = primitives.find((primitive) => primitive.id === value);

  function selectPrimitive(primitiveId: string) {
    onChange(primitiveId);
    setIsOpen(false);
  }

  return (
    <Popover onOpenChange={setIsOpen} open={isOpen}>
      <PopoverTrigger asChild>
        <Button
          aria-expanded={isOpen}
          className="w-80 justify-between overflow-hidden bg-slate-900 text-left font-normal"
          role="combobox"
          type="button"
          variant="secondary"
        >
          <span className="min-w-0 truncate font-mono text-xs">
            {selectedPrimitive
              ? `${selectedPrimitive.id} - ${selectedPrimitive.name}`
              : "Select primitive"}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 text-slate-400" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[420px] p-0">
        <Command>
          <CommandInput placeholder="Search primitives..." />
          <CommandList>
            <CommandEmpty>No primitive found.</CommandEmpty>
            <CommandGroup>
              {primitives.map((primitive) => (
                <CommandItem
                  key={primitive.id}
                  onSelect={() => selectPrimitive(primitive.id)}
                  value={`${primitive.id} ${primitive.name} ${primitive.family} ${primitive.description}`}
                >
                  <Check
                    className={cn(
                      "mt-0.5 size-4 flex-none text-cyan-200",
                      primitive.id === value ? "opacity-100" : "opacity-0"
                    )}
                    aria-hidden="true"
                  />
                  <span className="min-w-0">
                    <span className="block font-mono text-slate-100 text-xs">
                      {primitive.id}
                    </span>
                    <span className="block mt-0.5 text-slate-400 text-xs">
                      {primitive.name} / {primitive.family}
                    </span>
                    <span className="block mt-1 text-slate-500 text-xs line-clamp-2">
                      {primitive.description}
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function PrimitiveEditor({
  assignment,
  assignmentIndex,
  clauseId,
  onChangeParameter,
  onRemovePrimitive,
  primitiveCatalogById
}: {
  assignment: EditableAssignment;
  assignmentIndex: number;
  clauseId: string;
  onChangeParameter(
    clauseId: string,
    assignmentIndex: number,
    parameterName: string,
    value: string
  ): void;
  onRemovePrimitive(clauseId: string, assignmentIndex: number): void;
  primitiveCatalogById: Map<string, PrimitiveCatalogEntry>;
}) {
  const catalogEntry = primitiveCatalogById.get(assignment.primitiveId);
  const parameterNames = [
    ...new Set([
      ...(catalogEntry?.parameters.map((parameter) => parameter.name) ?? []),
      ...Object.keys(assignment.parameters)
    ])
  ];

  return (
    <div className="bg-white/[0.03] p-3 border border-white/10 rounded-md">
      <div className="flex justify-between gap-3">
        <div>
          <p className="font-mono text-cyan-100 text-xs">{assignment.primitiveId}</p>
          <p className="mt-1 text-slate-500 text-xs">{catalogEntry?.description}</p>
        </div>
        <Button
          onClick={() => onRemovePrimitive(clauseId, assignmentIndex)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      </div>

      {(catalogEntry?.fixedRules.length ?? 0) > 0 && (
        <div className="mt-3 rounded-md border border-cyan-400/15 bg-cyan-400/5 p-3">
          <p className="text-xs font-medium uppercase text-cyan-100">
            Inherited rules
          </p>
          <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-300">
            {catalogEntry?.fixedRules.map((rule) => (
              <li className="flex gap-2" key={rule}>
                <span className="text-cyan-300" aria-hidden="true">
                  -
                </span>
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {((catalogEntry?.listensToEvents.length ?? 0) > 0 ||
        (catalogEntry?.emitsEvents.length ?? 0) > 0) && (
        <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
          {(catalogEntry?.listensToEvents.length ?? 0) > 0 && (
            <div>
              <p className="text-slate-500">Listens to</p>
              <p className="mt-1 font-mono text-cyan-100">
                {catalogEntry?.listensToEvents.join(", ")}
              </p>
            </div>
          )}
          {(catalogEntry?.emitsEvents.length ?? 0) > 0 && (
            <div>
              <p className="text-slate-500">Emits</p>
              <p className="mt-1 font-mono text-emerald-200">
                {catalogEntry?.emitsEvents.join(", ")}
              </p>
            </div>
          )}
        </div>
      )}

      {parameterNames.length > 0 && (
        <div className="gap-3 grid sm:grid-cols-2 xl:grid-cols-3 mt-3">
          {parameterNames.map((parameterName) => {
            const parameterDefinition = catalogEntry?.parameters.find(
              (parameter) => parameter.name === parameterName
            );
            const parameterOptions = parameterDefinition?.options ?? [];
            const fieldValue = String(assignment.parameters[parameterName] ?? "");

            return (
              <div className="block" key={parameterName}>
                <span className="text-slate-400 text-xs">
                  {parameterName}
                  {parameterDefinition?.required ? " *" : ""}
                </span>
                {parameterOptions.length > 0 ? (
                  <Select
                    onValueChange={(value) =>
                      onChangeParameter(
                        clauseId,
                        assignmentIndex,
                        parameterName,
                        value
                      )
                    }
                    value={fieldValue || undefined}
                  >
                    <SelectTrigger
                      aria-label={parameterName}
                      className="mt-1"
                    >
                      <SelectValue placeholder={`Select ${parameterName}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {parameterOptions.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <input
                    className="bg-slate-950 mt-1 px-2 py-2 border border-white/15 rounded-md w-full text-sm"
                    onChange={(event) =>
                      onChangeParameter(
                        clauseId,
                        assignmentIndex,
                        parameterName,
                        event.target.value
                      )
                    }
                    type={parameterDefinition?.type === "number" ? "number" : "text"}
                    value={fieldValue}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function addManualClause(draft: ReviewDraft): ReviewDraft {
  const sourceText = "Manual behavior";

  return {
    ...draft,
    clauses: [
      ...draft.clauses,
      {
        id: nextManualClauseId(draft),
        sourceText,
        normalizedText: sourceText,
        unsupportedReason: null,
        assignments: []
      }
    ]
  };
}

function addPrimitiveToClause(
  draft: ReviewDraft,
  clauseId: string,
  primitiveId: string,
  primitiveCatalogById: Map<string, PrimitiveCatalogEntry>
): ReviewDraft {
  const primitive = primitiveCatalogById.get(primitiveId);

  if (!primitive) {
    return draft;
  }

  return {
    ...draft,
    clauses: draft.clauses.map((clause) =>
      clause.id === clauseId
        ? {
            ...clause,
            assignments: [
              ...clause.assignments,
              {
                primitiveId,
                family: primitive.family,
                sourceText: clause.sourceText,
                parameters: {},
                confidence: "medium"
              }
            ]
          }
        : clause
    )
  };
}

function removePrimitiveFromClause(
  draft: ReviewDraft,
  clauseId: string,
  assignmentIndex: number
): ReviewDraft {
  return {
    ...draft,
    clauses: draft.clauses.map((clause) =>
      clause.id === clauseId
        ? {
            ...clause,
            assignments: clause.assignments.filter(
              (_, index) => index !== assignmentIndex
            )
          }
        : clause
    )
  };
}

function updateClauseSourceText(
  draft: ReviewDraft,
  clauseId: string,
  sourceText: string
): ReviewDraft {
  return {
    ...draft,
    clauses: draft.clauses.map((clause) =>
      clause.id === clauseId
        ? {
            ...clause,
            sourceText,
            normalizedText: sourceText.replace(/\s+/g, " ").trim(),
            assignments: clause.assignments.map((assignment) => ({
              ...assignment,
              sourceText
            }))
          }
        : clause
    )
  };
}

function updateAssignmentParameter({
  assignmentIndex,
  clauseId,
  draft,
  parameterName,
  primitiveCatalogById,
  value
}: {
  assignmentIndex: number;
  clauseId: string;
  draft: ReviewDraft;
  parameterName: string;
  primitiveCatalogById: Map<string, PrimitiveCatalogEntry>;
  value: string;
}): ReviewDraft {
  return {
    ...draft,
    clauses: draft.clauses.map((clause) =>
      clause.id === clauseId
        ? {
            ...clause,
            assignments: clause.assignments.map((assignment, index) =>
              index === assignmentIndex
                ? {
                    ...assignment,
                    parameters: {
                      ...assignment.parameters,
                      [parameterName]: parseParameterValue({
                        primitiveCatalogById,
                        assignment,
                        parameterName,
                        value
                      })
                    }
                  }
                : assignment
            )
          }
        : clause
    )
  };
}

function parseParameterValue({
  assignment,
  parameterName,
  primitiveCatalogById,
  value
}: {
  assignment: EditableAssignment;
  parameterName: string;
  primitiveCatalogById: Map<string, PrimitiveCatalogEntry>;
  value: string;
}): string | number | boolean | null {
  if (value.trim() === "") {
    return null;
  }

  const parameterDefinition = primitiveCatalogById
    .get(assignment.primitiveId)
    ?.parameters.find((parameter) => parameter.name === parameterName);

  if (parameterDefinition?.type === "number") {
    return Number(value);
  }

  if (parameterDefinition?.type === "boolean") {
    return value === "true";
  }

  return value;
}

function nextManualClauseId(draft: ReviewDraft): string {
  const existingIds = new Set(draft.clauses.map((clause) => clause.id));
  let index = draft.clauses.length + 1;
  let clauseId = `manual-clause-${index}`;

  while (existingIds.has(clauseId)) {
    index += 1;
    clauseId = `manual-clause-${index}`;
  }

  return clauseId;
}

function PrimitiveChips({ primitiveIds }: { primitiveIds: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {primitiveIds.map((primitiveId) => (
        <span
          className="bg-white/5 px-2 py-1 border border-white/10 rounded font-mono text-[11px] text-slate-300"
          key={primitiveId}
        >
          {primitiveId}
        </span>
      ))}
    </div>
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

function isCardModelingComplete(card: PreviewCard): boolean {
  if (card.isVanilla) {
    return true;
  }

  const suggestion = card.suggestion;

  return Boolean(
    suggestion &&
      suggestion.unsupportedClauseCount === 0 &&
      suggestion.missingRequiredParameterCount === 0 &&
      suggestion.supportStatus !== "ambiguous" &&
      suggestion.supportStatus !== "unsupported"
  );
}

function formatStatus(status: string): string {
  return status.replaceAll("_", " ");
}
