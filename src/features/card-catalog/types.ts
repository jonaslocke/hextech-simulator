import type {
  ApprovedCardBehaviorInput,
  CardCatalogImportPreviewResult,
  PersistedCardValidationStatus
} from "@/server/card-catalog";

export type CardCatalogPreviewResponse =
  | {
      accepted: true;
      preview: CardCatalogImportPreviewResult;
    }
  | {
      accepted: false;
      error: {
        code: string;
        message: string;
        details?: string[];
      };
    };

export type CardCatalogApprovalRequest = ApprovedCardBehaviorInput;

export type CardCatalogApprovalResponse =
  | {
      accepted: true;
      behavior: {
        cardCode: string;
        status: PersistedCardValidationStatus;
        sourceTextHash: string;
        updatedAt: string;
      };
    }
  | {
      accepted: false;
      error: {
        code: string;
        message: string;
        details?: string[];
      };
    };
