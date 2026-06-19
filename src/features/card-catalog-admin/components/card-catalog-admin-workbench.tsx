"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  Database,
  FileJson,
  ListChecks,
  Loader2,
  RefreshCw,
  Upload,
  XCircle
} from "lucide-react";
import { Button } from "@/shared/components/button";
import { cn } from "@/shared/utils/cn";

type BundledSet = "ogs" | "ogn" | "sfd" | "all";

type ImportRun = {
  id: string;
  setCode: string;
  uploadedFileName: string;
  totalCardsRead: number;
  behaviorDraftsSuggested: number;
  groupingDraftsSuggested: number;
  warnings: string[];
};

type BehaviorEffect = {
  type: string;
  keyword?: string;
  target?: string;
};

type BehaviorDraft = {
  id: string;
  name: string;
  sourceClauses: string[];
  matchedCardCodes: string[];
  unresolvedClauses: string[];
  confidence: "high" | "medium" | "low";
  status: string;
  reviewerNotes: string | null;
  similarApprovedTemplateIds: string[];
  suggestedBehavior: {
    timing: string;
    effects: BehaviorEffect[];
  } | null;
};

type BehaviorDraftReviewStatus =
  | "manual_review"
  | "blocked_by_engine_capability"
  | "rejected";

type GroupingDraft = {
  id: string;
  groupId: string;
  importRunId: string;
  cardCode: string;
  status: string;
  sourcePublicCodes: string[];
  removedVariantPublicCodes: string[];
  warnings: string[];
  canonicalCard: {
    name: string;
    cleanName: string;
    catalogStatus: string;
    variants: Array<{
      publicCode: string;
      alternateArt: boolean;
      overnumbered: boolean;
      signature: boolean;
    }>;
  };
};

type ApiResult<T> =
  | ({
      accepted: true;
    } & T)
  | {
      accepted: false;
      error: {
        message: string;
      };
    };

type WorkbenchTab = "behaviors" | "catalog";

const bundledSetOptions: Array<{ id: BundledSet; label: string }> = [
  { id: "ogs", label: "OGS" },
  { id: "ogn", label: "OGN" },
  { id: "sfd", label: "SFD" },
  { id: "all", label: "All" }
];

export function CardCatalogAdminWorkbench() {
  const [activeTab, setActiveTab] = useState<WorkbenchTab>("behaviors");
  const [bundledSet, setBundledSet] = useState<BundledSet>("ogs");
  const [file, setFile] = useState<File | null>(null);
  const [behaviorImportRun, setBehaviorImportRun] = useState<ImportRun | null>(null);
  const [catalogImportRun, setCatalogImportRun] = useState<ImportRun | null>(null);
  const [behaviorDrafts, setBehaviorDrafts] = useState<BehaviorDraft[]>([]);
  const [groupingDrafts, setGroupingDrafts] = useState<GroupingDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const visibleDrafts = useMemo(
    () =>
      [...behaviorDrafts].sort(
        (left, right) =>
          right.matchedCardCodes.length - left.matchedCardCodes.length ||
          left.name.localeCompare(right.name)
      ),
    [behaviorDrafts]
  );
  const visibleGroups = useMemo(
    () =>
      [...groupingDrafts].sort((left, right) =>
        left.cardCode.localeCompare(right.cardCode)
      ),
    [groupingDrafts]
  );
  const approvedDraftCount = behaviorDrafts.filter(
    (draft) => draft.status === "approved"
  ).length;
  const cleanDraftCount = behaviorDrafts.filter(
    (draft) => draft.unresolvedClauses.length === 0
  ).length;
  const validatedGroupCount = groupingDrafts.filter(
    (draft) => draft.status === "validated"
  ).length;

  async function runBehaviorAnalysis() {
    await runAction("behavior-analysis", async () => {
      const payload = await postCardSet<ApiResult<{
        importRun: ImportRun;
        drafts: BehaviorDraft[];
      }>>("/api/admin/card-catalog/behavior-analysis");

      if (!payload.accepted) {
        throw new Error(payload.error.message);
      }

      setBehaviorImportRun(payload.importRun);
      setBehaviorDrafts(payload.drafts);
      setActiveTab("behaviors");
      setNotice(`Generated ${payload.drafts.length} behavior drafts.`);
    });
  }

  async function createCatalogImport() {
    await runAction("catalog-import", async () => {
      const payload = await postCardSet<ApiResult<{
        importRun: ImportRun;
        groupingDrafts: GroupingDraft[];
      }>>("/api/admin/card-catalog/imports");

      if (!payload.accepted) {
        throw new Error(payload.error.message);
      }

      setCatalogImportRun(payload.importRun);
      setGroupingDrafts(payload.groupingDrafts);
      setActiveTab("catalog");
      setNotice(`Created ${payload.groupingDrafts.length} grouping drafts.`);
    });
  }

  async function refreshBehaviorDrafts() {
    await runAction("refresh-drafts", async () => {
      const suffix = behaviorImportRun
        ? `?importRunId=${encodeURIComponent(behaviorImportRun.id)}`
        : "";
      const payload = await fetchJson<ApiResult<{ drafts: BehaviorDraft[] }>>(
        `/api/admin/card-catalog/behavior-template-drafts${suffix}`
      );

      if (!payload.accepted) {
        throw new Error(payload.error.message);
      }

      setBehaviorDrafts(payload.drafts);
      setNotice(`Loaded ${payload.drafts.length} behavior drafts.`);
    });
  }

  async function approveBehaviorDraft(draft: BehaviorDraft) {
    await runAction(`approve:${draft.id}`, async () => {
      const payload = await fetchJson<ApiResult<{ deduplicated: boolean }>>(
        `/api/admin/card-catalog/behavior-template-drafts/${encodeURIComponent(
          draft.id
        )}/approve`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            approvedBy: "manual-test"
          })
        }
      );

      if (!payload.accepted) {
        throw new Error(payload.error.message);
      }

      await refreshBehaviorDrafts();
      setNotice(payload.deduplicated ? "Reused existing template." : "Approved template.");
    });
  }

  async function updateBehaviorDraftReviewStatus(
    draft: BehaviorDraft,
    status: BehaviorDraftReviewStatus
  ) {
    const defaultNote =
      status === "blocked_by_engine_capability"
        ? "Behavior is understood but blocked by missing engine capability."
        : status === "rejected"
          ? "Rejected during manual review."
          : (draft.reviewerNotes ?? "");
    const reviewerNotes = window.prompt("Reviewer notes", defaultNote);

    if (reviewerNotes === null) {
      return;
    }

    await runAction(`review:${status}:${draft.id}`, async () => {
      const payload = await fetchJson<ApiResult<{ draft: BehaviorDraft }>>(
        `/api/admin/card-catalog/behavior-template-drafts/${encodeURIComponent(
          draft.id
        )}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            status,
            reviewerNotes
          })
        }
      );

      if (!payload.accepted) {
        throw new Error(payload.error.message);
      }

      setBehaviorDrafts((current) =>
        current.map((candidate) =>
          candidate.id === draft.id ? payload.draft : candidate
        )
      );
      setNotice(`Marked ${draft.name} as ${status.replace(/_/g, " ")}.`);
    });
  }

  async function validateGroup(group: GroupingDraft) {
    await runAction(`validate:${group.groupId}`, async () => {
      const payload = await fetchJson<ApiResult<{ draft: GroupingDraft }>>(
        `/api/admin/card-catalog/imports/${encodeURIComponent(
          group.importRunId
        )}/groups/${encodeURIComponent(group.groupId)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            status: "validated"
          })
        }
      );

      if (!payload.accepted) {
        throw new Error(payload.error.message);
      }

      setGroupingDrafts((current) =>
        current.map((candidate) =>
          candidate.groupId === group.groupId ? payload.draft : candidate
        )
      );
      setNotice(`Validated ${group.cardCode}.`);
    });
  }

  async function postCardSet<T>(url: string): Promise<T> {
    if (file) {
      const formData = new FormData();
      formData.append("file", file);
      return fetchJson<T>(url, {
        method: "POST",
        body: formData
      });
    }

    return fetchJson<T>(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        bundledSet
      })
    });
  }

  async function runAction(action: string, callback: () => Promise<void>) {
    setBusyAction(action);
    setError(null);
    setNotice(null);

    try {
      await callback();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Request failed.");
    } finally {
      setBusyAction(null);
    }
  }

  const isBusy = busyAction !== null;

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-slate-100">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="font-title text-2xl font-semibold">Card Catalog Admin</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-400">
              Behavior templates, catalog grouping, and card assignment staging.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="h-10 rounded-md border border-white/10 bg-slate-900 px-3 text-sm text-slate-100"
              value={bundledSet}
              onChange={(event) => setBundledSet(event.target.value as BundledSet)}
            >
              {bundledSetOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-white/10 bg-slate-900 px-3 text-sm text-slate-100 hover:bg-slate-800">
              <Upload className="size-4" />
              <span>{file ? file.name : "JSON file"}</span>
              <input
                className="sr-only"
                type="file"
                accept="application/json,.json"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </label>
            {file && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setFile(null)}
                disabled={isBusy}
              >
                Use bundled
              </Button>
            )}
          </div>
        </header>

        {(error || notice) && (
          <div
            className={cn(
              "rounded-md border px-3 py-2 text-sm",
              error
                ? "border-red-400/40 bg-red-950/50 text-red-100"
                : "border-emerald-300/30 bg-emerald-950/30 text-emerald-100"
            )}
          >
            {error ?? notice}
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-4">
          <MetricCard
            icon={<FileJson className="size-4" />}
            label="Behavior Drafts"
            value={behaviorDrafts.length}
          />
          <MetricCard
            icon={<CheckCircle2 className="size-4" />}
            label="Clean Drafts"
            value={cleanDraftCount}
          />
          <MetricCard
            icon={<Database className="size-4" />}
            label="Approved Drafts"
            value={approvedDraftCount}
          />
          <MetricCard
            icon={<ListChecks className="size-4" />}
            label="Validated Groups"
            value={`${validatedGroupCount}/${groupingDrafts.length}`}
          />
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-slate-900/70 p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={runBehaviorAnalysis}
              disabled={isBusy}
            >
              {busyAction === "behavior-analysis" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FileJson className="size-4" />
              )}
              Analyze Behaviors
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={createCatalogImport}
              disabled={isBusy}
            >
              {busyAction === "catalog-import" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Database className="size-4" />
              )}
              Create Catalog Import
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={refreshBehaviorDrafts}
              disabled={isBusy}
            >
              <RefreshCw className={cn("size-4", busyAction === "refresh-drafts" && "animate-spin")} />
              Refresh Drafts
            </Button>
          </div>
          <div className="flex rounded-md border border-white/10 bg-slate-950 p-1">
            <TabButton
              active={activeTab === "behaviors"}
              onClick={() => setActiveTab("behaviors")}
            >
              Behaviors
            </TabButton>
            <TabButton
              active={activeTab === "catalog"}
              onClick={() => setActiveTab("catalog")}
            >
              Catalog
            </TabButton>
          </div>
        </div>

        <RunSummary
          behaviorImportRun={behaviorImportRun}
          catalogImportRun={catalogImportRun}
        />

        {activeTab === "behaviors" ? (
          <BehaviorDraftList
            drafts={visibleDrafts}
            busyAction={busyAction}
            onApprove={approveBehaviorDraft}
            onReviewStatusChange={updateBehaviorDraftReviewStatus}
          />
        ) : (
          <GroupingDraftList
            groups={visibleGroups}
            busyAction={busyAction}
            onValidate={validateGroup}
          />
        )}
      </section>
    </main>
  );
}

function MetricCard({
  icon,
  label,
  value
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-900 p-4">
      <div className="flex items-center gap-2 text-slate-400">
        {icon}
        <span className="text-xs font-semibold uppercase">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function TabButton({
  active,
  children,
  onClick
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "h-8 rounded px-3 text-sm",
        active ? "bg-cyan-300 text-slate-950" : "text-slate-300 hover:bg-white/10"
      )}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function RunSummary({
  behaviorImportRun,
  catalogImportRun
}: {
  behaviorImportRun: ImportRun | null;
  catalogImportRun: ImportRun | null;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <RunSummaryCard title="Behavior Run" run={behaviorImportRun} />
      <RunSummaryCard title="Catalog Run" run={catalogImportRun} />
    </div>
  );
}

function RunSummaryCard({ run, title }: { run: ImportRun | null; title: string }) {
  return (
    <section className="rounded-lg border border-white/10 bg-slate-900 p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {run ? (
        <div className="mt-3 grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
          <Field label="ID" value={run.id} />
          <Field label="File" value={run.uploadedFileName} />
          <Field label="Set" value={run.setCode} />
          <Field label="Cards" value={run.totalCardsRead} />
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-500">No run loaded.</p>
      )}
    </section>
  );
}

function Field({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className="truncate font-mono text-xs text-slate-200">{value}</div>
    </div>
  );
}

function BehaviorDraftList({
  busyAction,
  drafts,
  onApprove,
  onReviewStatusChange
}: {
  busyAction: string | null;
  drafts: BehaviorDraft[];
  onApprove: (draft: BehaviorDraft) => void;
  onReviewStatusChange: (
    draft: BehaviorDraft,
    status: BehaviorDraftReviewStatus
  ) => void;
}) {
  if (drafts.length === 0) {
    return <EmptyPanel label="No behavior drafts loaded." />;
  }

  return (
    <section className="grid gap-3">
      {drafts.map((draft) => {
        const canApprove =
          draft.status !== "approved" && draft.unresolvedClauses.length === 0;
        const needsManualReview =
          draft.unresolvedClauses.length > 0 ||
          draft.suggestedBehavior?.effects.some(
            (effect) => effect.type === "manualReview"
          );

        return (
          <article
            key={draft.id}
            className="rounded-lg border border-white/10 bg-slate-900 p-4"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{draft.name}</h3>
                  <StatusBadge value={draft.status} />
                  <ConfidenceBadge value={draft.confidence} />
                  {draft.similarApprovedTemplateIds.length > 0 && (
                    <span className="rounded bg-emerald-400/15 px-2 py-1 text-xs text-emerald-100">
                      matched
                    </span>
                  )}
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-slate-400">
                  {draft.sourceClauses.join(" | ")}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {canApprove && (
                  <Button
                    type="button"
                    size="sm"
                    disabled={busyAction === `approve:${draft.id}`}
                    onClick={() => onApprove(draft)}
                  >
                    {busyAction === `approve:${draft.id}` ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="size-4" />
                    )}
                    Approve
                  </Button>
                )}
                {needsManualReview && draft.status !== "approved" && (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={
                        draft.status === "blocked_by_engine_capability" ||
                        busyAction === `review:blocked_by_engine_capability:${draft.id}`
                      }
                      onClick={() =>
                        onReviewStatusChange(
                          draft,
                          "blocked_by_engine_capability"
                        )
                      }
                    >
                      {busyAction ===
                      `review:blocked_by_engine_capability:${draft.id}` ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <CircleAlert className="size-4" />
                      )}
                      Block
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={
                        draft.status === "rejected" ||
                        busyAction === `review:rejected:${draft.id}`
                      }
                      onClick={() => onReviewStatusChange(draft, "rejected")}
                    >
                      {busyAction === `review:rejected:${draft.id}` ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <XCircle className="size-4" />
                      )}
                      Reject
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={
                        draft.status === "manual_review" ||
                        busyAction === `review:manual_review:${draft.id}`
                      }
                      onClick={() =>
                        onReviewStatusChange(draft, "manual_review")
                      }
                    >
                      Review Note
                    </Button>
                  </>
                )}
              </div>
            </div>
            <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
              <Field label="Cards" value={draft.matchedCardCodes.length} />
              <Field label="Timing" value={draft.suggestedBehavior?.timing ?? "none"} />
              <Field
                label="Effects"
                value={
                  draft.suggestedBehavior?.effects
                    .map((effect) => effect.type)
                    .join(", ") ?? "none"
                }
              />
            </div>
            {draft.unresolvedClauses.length > 0 && (
              <div className="mt-3 rounded border border-amber-300/20 bg-amber-950/30 p-3 text-sm text-amber-100">
                {draft.unresolvedClauses.slice(0, 3).join(" | ")}
              </div>
            )}
            {draft.reviewerNotes && (
              <div className="mt-3 rounded border border-cyan-300/20 bg-cyan-950/20 p-3 text-sm text-cyan-100">
                {draft.reviewerNotes}
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}

function GroupingDraftList({
  busyAction,
  groups,
  onValidate
}: {
  busyAction: string | null;
  groups: GroupingDraft[];
  onValidate: (group: GroupingDraft) => void;
}) {
  if (groups.length === 0) {
    return <EmptyPanel label="No grouping drafts loaded." />;
  }

  return (
    <section className="grid gap-3">
      {groups.map((group) => (
        <article
          key={group.groupId}
          className="rounded-lg border border-white/10 bg-slate-900 p-4"
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">
                  {group.cardCode} · {group.canonicalCard.name}
                </h3>
                <StatusBadge value={group.status} />
              </div>
              <p className="mt-2 text-sm text-slate-400">
                {group.sourcePublicCodes.join(", ")}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              disabled={
                group.status === "validated" ||
                busyAction === `validate:${group.groupId}`
              }
              onClick={() => onValidate(group)}
            >
              {busyAction === `validate:${group.groupId}` ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
              Validate
            </Button>
          </div>
          <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
            <Field label="Variants" value={group.canonicalCard.variants.length} />
            <Field label="Catalog" value={group.canonicalCard.catalogStatus} />
            <Field label="Warnings" value={group.warnings.length} />
          </div>
          {group.warnings.length > 0 && (
            <div className="mt-3 rounded border border-amber-300/20 bg-amber-950/30 p-3 text-sm text-amber-100">
              {group.warnings.join(" | ")}
            </div>
          )}
        </article>
      ))}
    </section>
  );
}

function StatusBadge({ value }: { value: string }) {
  return (
    <span className="rounded bg-white/10 px-2 py-1 text-xs capitalize text-slate-200">
      {value.replace(/_/g, " ")}
    </span>
  );
}

function ConfidenceBadge({ value }: { value: "high" | "medium" | "low" }) {
  return (
    <span
      className={cn(
        "rounded px-2 py-1 text-xs capitalize",
        value === "high" && "bg-emerald-400/15 text-emerald-100",
        value === "medium" && "bg-cyan-400/15 text-cyan-100",
        value === "low" && "bg-amber-400/15 text-amber-100"
      )}
    >
      {value}
    </span>
  );
}

function EmptyPanel({ label }: { label: string }) {
  return (
    <section className="rounded-lg border border-dashed border-white/15 bg-slate-900/50 p-8 text-center text-sm text-slate-500">
      {label}
    </section>
  );
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json()) as T;

  return payload;
}
