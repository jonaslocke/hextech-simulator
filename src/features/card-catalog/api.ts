import type { CardCatalogPreviewResponse } from "./types";

export async function previewCardCatalogUpload(
  file: File
): Promise<CardCatalogPreviewResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/admin/card-catalog/preview", {
    method: "POST",
    body: formData
  });

  return (await response.json()) as CardCatalogPreviewResponse;
}
