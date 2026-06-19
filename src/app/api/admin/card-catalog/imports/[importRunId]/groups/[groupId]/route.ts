import { updateCardGroupingDraft } from "@/server/card-catalog-admin";
import {
  adminErrorResponse,
  adminJsonResponse,
  getCardCatalogAdminRepositories
} from "../../../../route-utils";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ importRunId: string; groupId: string }> }
) {
  try {
    const { importRunId, groupId } = await context.params;
    const repositories = await getCardCatalogAdminRepositories();
    const patch = (await request.json()) as {
      status?: "suggested" | "validated" | "rejected";
      removedVariantPublicCodes?: string[];
    };
    const draft = await updateCardGroupingDraft(repositories, {
      importRunId,
      groupId,
      ...patch
    });

    return adminJsonResponse({
      accepted: true,
      draft
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
