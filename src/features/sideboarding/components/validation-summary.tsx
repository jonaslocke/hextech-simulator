import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { Button } from "@/shared/components/button";
import type { SideboardingValidationState } from "../use-sideboarding-validation";

export function ValidationSummary({
  validation,
}: {
  validation: SideboardingValidationState;
}) {
  if (validation.pending) {
    return (
      <div className="flex items-center gap-2 text-cyan-100 text-sm">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Validating deck
      </div>
    );
  }

  if (validation.error) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-red-100 text-sm">
        <AlertTriangle className="h-4 w-4" />
        <span>{validation.error}</span>
        <Button onClick={validation.retry} size="xs" type="button" variant="secondary">
          Retry
        </Button>
      </div>
    );
  }

  if (validation.response?.legal) {
    return (
      <div className="flex items-center gap-2 text-emerald-100 text-sm">
        <CheckCircle2 className="h-4 w-4" />
        Deck is legal
      </div>
    );
  }

  return (
    <div className="max-h-20 overflow-y-auto text-amber-100 text-sm">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" />
        Deck needs changes
      </div>
      <ul className="mt-1 space-y-1 text-amber-100/85 text-xs">
        {(validation.response?.reasons ?? []).map((reason) => (
          <li key={`${reason.code}:${reason.registeredCardId ?? reason.canonicalName ?? reason.message}`}>
            {reason.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
