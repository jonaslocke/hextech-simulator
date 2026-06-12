import { BoardPreview } from "@/components/game/board-preview";
import { loadCardCatalog, requireCardByName } from "@/server/catalog";

export default async function Home() {
  const catalog = await loadCardCatalog();

  return (
    <BoardPreview
      annieChampion={requireCardByName(catalog, "Annie, Stubborn")}
      annieLegend={requireCardByName(catalog, "Dark Child - Starter")}
      luxChampion={requireCardByName(catalog, "Lux, Crownguard")}
      luxLegend={requireCardByName(catalog, "Lady of Luminosity - Starter")}
      opponentBattlefield={requireCardByName(catalog, "Reaver's Row")}
      opponentUnits={[
        requireCardByName(catalog, "Lux, Crownguard"),
        requireCardByName(catalog, "Ravenbloom Student")
      ]}
      playerBattlefield={requireCardByName(catalog, "Obelisk of Power")}
      playerHand={[
        requireCardByName(catalog, "Gust"),
        requireCardByName(catalog, "Incinerate"),
        requireCardByName(catalog, "Morbid Return"),
        requireCardByName(catalog, "Mystic Poro"),
        requireCardByName(catalog, "Sneaky Deckhand")
      ]}
      playerRunes={[
        requireCardByName(catalog, "Fury Rune"),
        requireCardByName(catalog, "Chaos Rune"),
        requireCardByName(catalog, "Fury Rune"),
        requireCardByName(catalog, "Chaos Rune")
      ]}
      playerUnits={[
        requireCardByName(catalog, "Mystic Poro"),
        requireCardByName(catalog, "Sneaky Deckhand")
      ]}
    />
  );
}
