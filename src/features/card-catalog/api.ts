import type {
  CardCatalogApprovalRequest,
  CardCatalogApprovalResponse,
  CardCatalogPreviewResponse
} from "./types";

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

export async function approveCardCatalogBehavior(
  input: CardCatalogApprovalRequest
): Promise<CardCatalogApprovalResponse> {
  const response = await fetch("/api/admin/card-catalog/approve", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  return (await response.json()) as CardCatalogApprovalResponse;
}
