import { assignBehaviorToCard } from "@/server/card-catalog-admin";
import {
  adminErrorResponse,
  adminJsonResponse,
  getCardCatalogAdminRepositories
} from "../../../route-utils";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ cardCode: string }> }
) {
  try {
    const { cardCode } = await context.params;
    const repositories = await getCardCatalogAdminRepositories();
    const body = (await request.json()) as {
      behaviorTemplateId?: string | null;
      supportStatus:
        | "fully_supported"
        | "vanilla_supported"
        | "not_playable"
        | "blocked_by_missing_engine_capability"
        | "needs_behavior_review";
      reviewerNotes?: string | null;
      assignedBy?: string;
    };
    const assignment = await assignBehaviorToCard(repositories, {
      cardCode,
      ...body
    });

    return adminJsonResponse({
      accepted: true,
      assignment
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

