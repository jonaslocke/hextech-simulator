import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  serializeStructuredBugReport,
  type StructuredBugReport,
} from "@/shared/bug-report";

export const LOCAL_BUG_REPORT_ARTIFACTS_ENV =
  "HEXTECH_ENABLE_LOCAL_BUG_REPORT_ARTIFACTS";
export const MAX_LOCAL_BUG_REPORT_ARTIFACTS = 100;

type RuntimeEnvironment = Record<string, string | undefined>;

export class BugReportArtifactPersistenceDisabledError extends Error {
  constructor() {
    super("Local bug report artifact persistence is disabled.");
  }
}

export class BugReportArtifactCapacityError extends Error {
  constructor() {
    super("The local bug report artifact limit has been reached.");
  }
}

export function localBugReportArtifactPersistenceEnabled(
  environment: RuntimeEnvironment = process.env,
): boolean {
  return (
    (environment.NODE_ENV === "development" ||
      environment.NODE_ENV === "test") &&
    environment[LOCAL_BUG_REPORT_ARTIFACTS_ENV] === "true"
  );
}

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
  environment?: RuntimeEnvironment;
  report: StructuredBugReport;
  workspaceRoot?: string;
}): Promise<{ artifactPath: string }> {
  if (!localBugReportArtifactPersistenceEnabled(input.environment)) {
    throw new BugReportArtifactPersistenceDisabledError();
  }
  const workspaceRoot = path.resolve(input.workspaceRoot ?? process.cwd());
  const reportsDirectory = path.resolve(workspaceRoot, ".agent-work", "bug-reports");
  const artifactPath = path.resolve(reportsDirectory, bugReportArtifactFilename(input.report));
  const relativePath = path.relative(reportsDirectory, artifactPath);

  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("Invalid bug report artifact path.");
  }

  await mkdir(reportsDirectory, { recursive: true });
  const existingArtifacts = await readdir(reportsDirectory, {
    withFileTypes: true,
  });
  if (
    existingArtifacts.filter(
      (entry) => entry.isFile() && entry.name.endsWith(".json"),
    ).length >= MAX_LOCAL_BUG_REPORT_ARTIFACTS
  ) {
    throw new BugReportArtifactCapacityError();
  }
  await writeFile(artifactPath, `${serializeStructuredBugReport(input.report)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });

  return {
    artifactPath: [".agent-work", "bug-reports", relativePath].join("/"),
  };
}
