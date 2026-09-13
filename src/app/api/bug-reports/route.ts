import { NextResponse } from "next/server";
import {
  BUG_REPORT_MAX_PAYLOAD_BYTES,
  structuredBugReportSchema,
} from "@/shared/bug-report";
import {
  BugReportArtifactPersistenceDisabledError,
  localBugReportArtifactPersistenceEnabled,
  writeBugReportArtifact,
} from "@/server/bug-report/artifact-writer";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!localBugReportArtifactPersistenceEnabled()) {
    return artifactPersistenceDisabledResponse();
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > BUG_REPORT_MAX_PAYLOAD_BYTES) {
    return payloadTooLargeResponse();
  }

  const body = await request.text();
  if (Buffer.byteLength(body, "utf8") > BUG_REPORT_MAX_PAYLOAD_BYTES) {
    return payloadTooLargeResponse();
  }

  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    return invalidPayloadResponse();
  }

  const parsed = structuredBugReportSchema.safeParse(value);
  if (!parsed.success) {
    return invalidPayloadResponse();
  }
  try {
    const result = await writeBugReportArtifact({ report: parsed.data });
    return NextResponse.json({ accepted: true, ...result }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        accepted: false,
        error: {
          code:
            error instanceof BugReportArtifactPersistenceDisabledError
              ? "artifact_persistence_disabled"
              : "artifact_unavailable",
          message: "Local artifact storage is unavailable. Copy or export the report instead.",
        },
      },
      { status: 503 },
    );
  }
}

function artifactPersistenceDisabledResponse() {
  return NextResponse.json(
    {
      accepted: false,
      error: {
        code: "artifact_persistence_disabled",
        message:
          "Local bug report storage is disabled. Copy or export the report instead.",
      },
    },
    { status: 503 },
  );
}

function invalidPayloadResponse() {
  return NextResponse.json(
    {
      accepted: false,
      error: { code: "invalid_payload", message: "Bug report payload is malformed." },
    },
    { status: 400 },
  );
}

function payloadTooLargeResponse() {
  return NextResponse.json(
    {
      accepted: false,
      error: {
        code: "payload_too_large",
        message: "Bug report payload exceeds the local diagnostic limit.",
      },
    },
    { status: 413 },
  );
}
