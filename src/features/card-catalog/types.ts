import type { CardCatalogImportPreviewResult } from "@/server/card-catalog";

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
