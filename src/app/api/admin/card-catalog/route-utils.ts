import { NextResponse } from "next/server";
import {
  createCardCatalogAdminRepositories,
  type CardCatalogAdminRepositories
} from "@/server/card-catalog-admin";
import { getMongoDatabase } from "@/server/db";

export async function getCardCatalogAdminRepositories(): Promise<CardCatalogAdminRepositories> {
  return createCardCatalogAdminRepositories(await getMongoDatabase());
}

export function adminJsonResponse(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status });
}

export function adminErrorResponse(error: unknown, status = 400) {
  return NextResponse.json(
    {
      accepted: false,
      error: {
        code: "card_catalog_admin_error",
        message: error instanceof Error ? error.message : "Card catalog admin request failed."
      }
    },
    { status }
  );
}

