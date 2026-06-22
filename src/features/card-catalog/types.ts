import type {
  CanonicalCardPublicationInput,
  CardCatalogImportPreviewResult,
  PersistedCanonicalCardSummary
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

export type CardCatalogApprovalRequest = CanonicalCardPublicationInput;

export type CardCatalogApprovalResponse =
  | {
      accepted: true;
      behavior: {
        cardCode: string;
        status: PersistedCanonicalCardSummary["status"];
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
