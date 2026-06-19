import { approveBehaviorTemplateDraft } from "@/server/card-catalog-admin";
import {
  adminErrorResponse,
  adminJsonResponse,
  getCardCatalogAdminRepositories
} from "../../../route-utils";

export async function POST(
  request: Request,
  context: { params: Promise<{ draftId: string }> }
) {
  try {
    const { draftId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      approvedBy?: string;
    };
    const repositories = await getCardCatalogAdminRepositories();
    const result = await approveBehaviorTemplateDraft(repositories, {
      draftId,
      approvedBy: body.approvedBy
    });

    return adminJsonResponse({
      accepted: true,
      ...result
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

