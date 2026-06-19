import {
  analyzeBehaviorTemplates,
  parseCardSetRequest
} from "@/server/card-catalog-admin";
import {
  adminErrorResponse,
  adminJsonResponse,
  getCardCatalogAdminRepositories
} from "../route-utils";

export async function POST(request: Request) {
  try {
    const repositories = await getCardCatalogAdminRepositories();
    const source = await parseCardSetRequest(request);
    const result = await analyzeBehaviorTemplates(repositories, source);

    return adminJsonResponse(
      {
        accepted: true,
        importRun: result.importRun,
        drafts: result.drafts
      },
      201
    );
  } catch (error) {
    return adminErrorResponse(error);
  }
}

