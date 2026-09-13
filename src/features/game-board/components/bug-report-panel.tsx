"use client";

import { Check, Clipboard, Download, Flag, Save } from "lucide-react";
import { Button } from "@/shared/components/button";
import {
  BUG_REPORT_MAX_ISSUE_TEXT_LENGTH,
  BUG_REPORT_MAX_NOTES_LENGTH,
  type StructuredBugReport,
} from "@/shared/bug-report";
import { FloatingOverlayPanel } from "./floating-overlay-panel";

export type BugReportDraftView = {
  actual: string;
  expected: string;
  notes: string;
  selectedCardCount: number;
  stateVersion: number;
};

export function ReportBugButton({
  isReporting,
  onBegin,
}: {
  isReporting: boolean;
  onBegin: () => void;
}) {
  return (
    <Button
      aria-label="Report a gameplay bug"
      className="h-7 gap-1.5 px-2 text-xs"
      onClick={onBegin}
      title="Capture the current viewer-safe state for a bug report"
      variant="secondary"
    >
      <Flag aria-hidden="true" className="size-3.5" />
      {isReporting ? "Reporting" : "Report bug"}
    </Button>
  );
}

export function BugReportPanel({
  artifactPath,
  draft,
  error,
  isSaving,
  onActualChange,
  onCancel,
  onCopy,
  onExpectedChange,
  onExport,
  onFinalize,
  onNotesChange,
  report,
}: {
  artifactPath: string | null;
  draft: BugReportDraftView | null;
  error: string | null;
  isSaving: boolean;
  onActualChange: (value: string) => void;
  onCancel: () => void;
  onCopy: () => Promise<void>;
  onExpectedChange: (value: string) => void;
  onExport: () => void;
  onFinalize: () => Promise<void>;
  onNotesChange: (value: string) => void;
  report: StructuredBugReport | null;
}) {
  if (!draft) return null;

  const readyToFinalize = Boolean(draft.actual.trim() && draft.expected.trim());

  return (
    <FloatingOverlayPanel
      className="w-[min(30rem,calc(100vw-2rem))] max-h-[calc(100vh-3rem)] overflow-y-auto"
      closeLabel="Cancel bug report"
      dataOverlayKind="bug-report"
      isOpen
      onClose={onCancel}
      overlayLayer="diagnostic"
      title="Report bug"
    >
      <p className="mb-3 text-cyan-100/75 text-xs">
        Captured state v{draft.stateVersion}. Click visible cards on the board to mark them; this never sends a game action.
      </p>
      <label className="block mb-3 text-sm">
        <span className="mb-1 block font-medium">Actual behavior *</span>
        <textarea className="bg-slate-900/80 p-2 border border-white/15 rounded-md w-full min-h-20 text-sm" maxLength={BUG_REPORT_MAX_ISSUE_TEXT_LENGTH} onChange={(event) => onActualChange(event.target.value)} value={draft.actual} />
      </label>
      <label className="block mb-3 text-sm">
        <span className="mb-1 block font-medium">Expected behavior *</span>
        <textarea className="bg-slate-900/80 p-2 border border-white/15 rounded-md w-full min-h-20 text-sm" maxLength={BUG_REPORT_MAX_ISSUE_TEXT_LENGTH} onChange={(event) => onExpectedChange(event.target.value)} value={draft.expected} />
      </label>
      <label className="block mb-3 text-sm">
        <span className="mb-1 block font-medium">Notes</span>
        <textarea className="bg-slate-900/80 p-2 border border-white/15 rounded-md w-full min-h-16 text-sm" maxLength={BUG_REPORT_MAX_NOTES_LENGTH} onChange={(event) => onNotesChange(event.target.value)} value={draft.notes} />
      </label>
      <p className="mb-3 text-slate-300 text-xs">{draft.selectedCardCount} related card{draft.selectedCardCount === 1 ? "" : "s"} marked. Recent viewer-safe context is included automatically.</p>
      {artifactPath && (
        <p className="mb-3 rounded bg-emerald-950/70 p-2 text-emerald-100 text-xs whitespace-pre-wrap">Saved.\nDebug:\n{artifactPath}</p>
      )}
      {error && <p className="mb-3 text-amber-200 text-xs">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button disabled={!readyToFinalize || isSaving || Boolean(report)} onClick={() => void onFinalize()} size="sm">
          {artifactPath ? <Check aria-hidden="true" /> : <Save aria-hidden="true" />}
          {isSaving ? "Saving…" : report ? "Report finalized" : "Finalize report"}
        </Button>
        {report && (
          <>
            <Button onClick={() => void onCopy()} size="sm" variant="secondary"><Clipboard aria-hidden="true" />Copy report</Button>
            <Button onClick={onExport} size="sm" variant="secondary"><Download aria-hidden="true" />Export report</Button>
          </>
        )}
        <Button onClick={onCancel} size="sm" variant="ghost">{report ? "Close" : "Cancel"}</Button>
      </div>
    </FloatingOverlayPanel>
  );
}
