import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  serializeStructuredBugReport,
  type StructuredBugReport,
} from "@/shared/bug-report";

export function sanitizeBugReportPathSegment(value: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return sanitized || "unknown";
}

export function bugReportArtifactFilename(report: StructuredBugReport): string {
  const timestamp = sanitizeBugReportPathSegment(report.capturedAt.replace(/[:.]/g, "-"));
  const gameId = sanitizeBugReportPathSegment(report.match.gameId);
  return `${timestamp}-${gameId}-v${report.match.stateVersion}.json`;
}

export async function writeBugReportArtifact(input: {
  report: StructuredBugReport;
  workspaceRoot?: string;
}): Promise<{ artifactPath: string }> {
  const workspaceRoot = path.resolve(input.workspaceRoot ?? process.cwd());
  const reportsDirectory = path.resolve(workspaceRoot, ".agent-work", "bug-reports");
  const artifactPath = path.resolve(reportsDirectory, bugReportArtifactFilename(input.report));
  const relativePath = path.relative(reportsDirectory, artifactPath);

  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("Invalid bug report artifact path.");
  }

  await mkdir(reportsDirectory, { recursive: true });
  await writeFile(artifactPath, `${serializeStructuredBugReport(input.report)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });

  return {
    artifactPath: [".agent-work", "bug-reports", relativePath].join("/"),
  };
}
