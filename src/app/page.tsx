import { BoardPreview } from "@/components/game/board-preview";
import { loadCardCatalog, requireCardByName } from "@/server/catalog";

export default async function Home() {
  const catalog = await loadCardCatalog();

  return (
    <BoardPreview
      annieChampion={requireCardByName(catalog, "Annie, Stubborn")}
      annieLegend={requireCardByName(catalog, "Dark Child - Starter")}
      battlefield={requireCardByName(catalog, "Obelisk of Power")}
      luxChampion={requireCardByName(catalog, "Lux, Crownguard")}
      luxLegend={requireCardByName(catalog, "Lady of Luminosity - Starter")}
    />
  );
}
