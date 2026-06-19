import {
  adminErrorResponse,
  adminJsonResponse,
  getCardCatalogAdminRepositories
} from "../route-utils";
import type { CardBehaviorAssignmentDocument } from "@/server/card-catalog-admin";

export async function GET() {
  try {
    const repositories = await getCardCatalogAdminRepositories();
    const cards = (await repositories.canonicalCards.findAll()).sort((left, right) =>
      left.cardCode.localeCompare(right.cardCode)
    );
    const assignments = (await repositories.cardBehaviorAssignments.findAll())
      .map(normalizeAssignment)
      .sort((left, right) => left.cardCode.localeCompare(right.cardCode));

    return adminJsonResponse({
      accepted: true,
      cards,
      assignments
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

function normalizeAssignment(
  assignment: CardBehaviorAssignmentDocument & {
    behaviorTemplateId?: string | null;
  }
): CardBehaviorAssignmentDocument {
  if (assignment.behaviorTemplateIds) {
    return assignment;
  }

  const behaviorTemplateIds = assignment.behaviorTemplateId
    ? [assignment.behaviorTemplateId]
    : [];

  return {
    ...assignment,
    behaviorTemplateIds
  };
}
