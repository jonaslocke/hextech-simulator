import {
  adminErrorResponse,
  adminJsonResponse,
  getCardCatalogAdminRepositories
} from "../route-utils";

export async function GET() {
  try {
    const repositories = await getCardCatalogAdminRepositories();
    const templates = (await repositories.behaviorTemplates.findAll())
      .filter((template) => template.status === "approved")
      .sort((left, right) => left.name.localeCompare(right.name));

    return adminJsonResponse({
      accepted: true,
      templates
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
