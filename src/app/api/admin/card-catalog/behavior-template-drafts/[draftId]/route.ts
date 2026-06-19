import { updateBehaviorTemplateDraft } from "@/server/card-catalog-admin";
import {
  adminErrorResponse,
  adminJsonResponse,
  getCardCatalogAdminRepositories
} from "../../route-utils";

export async function GET(
  _request: Request,
  context: { params: Promise<{ draftId: string }> }
) {
  try {
    const { draftId } = await context.params;
    const repositories = await getCardCatalogAdminRepositories();
    const draft = await repositories.behaviorTemplateDrafts.findById(draftId);

    if (!draft) {
      return adminErrorResponse(new Error("Behavior template draft not found."), 404);
    }

    return adminJsonResponse({
      accepted: true,
      draft
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ draftId: string }> }
) {
  try {
    const { draftId } = await context.params;
    const repositories = await getCardCatalogAdminRepositories();
    const patch = await request.json();
    const draft = await updateBehaviorTemplateDraft(repositories, {
      draftId,
      patch
    });

    return adminJsonResponse({
      accepted: true,
      draft
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

