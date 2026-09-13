import { NextResponse } from "next/server";
import { structuredBugReportSchema } from "@/shared/bug-report";
import { writeBugReportArtifact } from "@/server/bug-report/artifact-writer";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsed = structuredBugReportSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { accepted: false, error: { code: "invalid_payload", message: "Bug report payload is malformed." } },
      { status: 400 },
    );
  }

  try {
    const result = await writeBugReportArtifact({ report: parsed.data });
    return NextResponse.json({ accepted: true, ...result }, { status: 201 });
  } catch {
    return NextResponse.json(
      { accepted: false, error: { code: "artifact_unavailable", message: "Local artifact storage is unavailable. Copy or export the report instead." } },
      { status: 503 },
    );
  }
}
