export class ActionSubmissionGuard {
  private activeSubmissionId: number | null = null;
  private nextSubmissionId = 0;

  begin(): number | null {
    if (this.activeSubmissionId !== null) return null;

    const submissionId = ++this.nextSubmissionId;
    this.activeSubmissionId = submissionId;
    return submissionId;
  }

  finish(submissionId: number): boolean {
    if (this.activeSubmissionId !== submissionId) return false;

    this.activeSubmissionId = null;
    return true;
  }

  reset(): void {
    this.activeSubmissionId = null;
  }
}
