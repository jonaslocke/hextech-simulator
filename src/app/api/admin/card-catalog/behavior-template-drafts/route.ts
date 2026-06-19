import {
  adminErrorResponse,
  adminJsonResponse,
  getCardCatalogAdminRepositories
} from "../route-utils";

export async function GET(request: Request) {
  try {
    const repositories = await getCardCatalogAdminRepositories();
    const url = new URL(request.url);
    const importRunId = url.searchParams.get("importRunId");
    const status = url.searchParams.get("status");
    const drafts = importRunId
      ? await repositories.behaviorTemplateDrafts.findByImportRunId(importRunId)
      : await repositories.behaviorTemplateDrafts.findAll();
    const filteredDrafts = status
      ? drafts.filter((draft) => draft.status === status)
      : drafts;

    return adminJsonResponse({
      accepted: true,
      drafts: filteredDrafts
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

