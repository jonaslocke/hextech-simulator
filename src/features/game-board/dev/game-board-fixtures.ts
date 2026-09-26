import type { GameProjection, ProjectedCardView, ProjectedPlayer, ProjectedZone } from "@/shared/game";

const images = {
  legend: "https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/44885d811b70621b188d9813b2b10b5cff1b81e6-744x1039.png",
  champion: "https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/17d0793ad495727e67bb1c94ae0e11cd4705870f-744x1039.png",
  runeMind: "https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/f99aa4874baaebd2e81798c8a3aa01c5900f6d30-744x1039.png",
  runeOrder: "https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/35ec6fdd2124324bb7052cba31c8c44f2e98f3ae-744x1039.png",
  battlefield: "https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/9301593f3800e68427469d38181b578a672473c3-1038x744.png",
  unit: "https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/41dee7ec46124c261352595cfbd8a6d38d32b947-744x1039.png",
  unit2: "https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/b98b1ff793b6eb263957258742cc83d50fda6537-744x1039.png",
  unit3: "https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/cf6d5447ff3634d8c2c0216cb2e5802fb5ca0b2e-744x1039.png",
  nonEquipmentGear: "https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/03824709acbb4151d13b083a842c4702a3e61221-744x1039.png",
  equipment: "https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/3a0de7eec3de501f79f33c09b43c7fe42721d10d-744x1039.png",
  equipment2: "https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/d09a797345659a1856d3d12910cf3c634990ea0c-744x1039.png",
};

export type GameBoardFixtureScenario = "stress" | "attachments" | "empty";
export type GameBoardFixtureOptions = {
  runeCount?: number;
  runeMode?: "ready" | "exhausted" | "mixed";
  battlefieldUnitCount?: number;
  hidden?: "none" | "owner" | "opponent" | "both";
  trashCount?: number;
  banishmentCount?: number;
  baseUnitCount?: number;
  nonEquipmentGearCount?: number;
  unattachedEquipmentCount?: number;
  attachedEquipmentCount?: number;
  unitReadiness?: "ready" | "exhausted" | "mixed";
  equipmentReadiness?: "ready" | "exhausted" | "mixed";
};

function card({
  id,
  owner,
  name,
  type,
  image = images.unit,
  might = null,
  tags = [],
  attachedTo = null,
  exhausted = false,
  damage = 0,
}: {
  id: string;
  owner: string;
  name: string;
  type: string;
  image?: string;
  might?: number | null;
  tags?: string[];
  attachedTo?: string | null;
  exhausted?: boolean;
  damage?: number;
}): ProjectedCardView {
  return {
    instanceId: id,
    ownerPlayerId: owner,
    name,
    imageUrl: image,
    rulesText: `${name} fixture card for board layout validation.`,
    publicCode: `${id.toUpperCase()}/001`,
    type,
    supertype: type === "Rune" ? "Basic" : null,
    domains: ["Mind"],
    tags,
    energy: type === "Unit" ? 2 : null,
    might,
    power: null,
    computedMight: might,
    damage,
    exhausted,
    empowered: false,
    attachedToCardInstanceId: attachedTo,
  };
}

function zone(kind: ProjectedZone["kind"], cards: ProjectedCardView[], count = cards.length, visibility: ProjectedZone["visibility"] = "public"): ProjectedZone {
  return { kind, cards, count, visibility };
}

function player(playerId: string, isViewer: boolean, scenario: GameBoardFixtureScenario, options: GameBoardFixtureOptions): ProjectedPlayer {
  const empty = scenario === "empty";
  const hasChampion = !empty;
  const defaultUnitCount = empty ? 0 : scenario === "stress" ? 4 : 3;
  const unitTemplates = [
    { name: "Daring Poro", might: 2, image: images.unit },
    { name: "Ravenbloom Student", might: 3, image: images.unit2 },
    { name: "Eager Apprentice", might: 3, image: images.unit3 },
    { name: "Lecturing Yordle", might: 2, image: images.unit2 },
  ];
  const units: ProjectedCardView[] = Array.from(
    { length: options.baseUnitCount ?? defaultUnitCount },
    (_, index) => {
      const template = unitTemplates[index % unitTemplates.length]!;
      const exhausted = options.unitReadiness === "ready"
        ? false
        : options.unitReadiness === "exhausted"
          ? true
          : (index === 0 && playerId === "p2") || index === 3;
      return card({
        id: `${playerId}-unit-${index + 1}`,
        owner: playerId,
        name: template.name,
        type: "Unit",
        might: template.might,
        image: template.image,
        exhausted,
        damage: index === 3 ? 1 : 0,
      });
    },
  );
  const defaultGearCount = empty ? 0 : 1;
  const defaultLooseEquipmentCount = empty ? 0 : 1;
  const defaultAttachedEquipmentCount = empty ? 0 : scenario === "stress" ? Math.min(3, units.length) : Math.min(1, units.length);
  const gear = Array.from({ length: options.nonEquipmentGearCount ?? defaultGearCount }, (_, index) => card({
    id: `${playerId}-gear-${index + 1}`,
    owner: playerId,
    name: index === 0 ? "Mask of Foresight" : `Gear ${index + 1}`,
    type: "Gear",
    image: images.nonEquipmentGear,
  }));
  const looseEquipment = Array.from({ length: options.unattachedEquipmentCount ?? defaultLooseEquipmentCount }, (_, index) => card({
    id: `${playerId}-equipment-loose-${index + 1}`,
    owner: playerId,
    name: index === 1 ? "Guardian Angel" : "Brutalizer",
    type: "Gear",
    tags: ["Equipment"],
    image: index === 1 ? images.equipment2 : images.equipment,
  }));
  const attachedEquipmentCount = Math.min(
    options.attachedEquipmentCount ?? defaultAttachedEquipmentCount,
    units.length * 4,
  );
  const attachedEquipment = Array.from({ length: attachedEquipmentCount }, (_, index) => {
    const host = units[Math.floor(index / 4)]!;
    return card({
      id: `${playerId}-equipment-${index + 1}`,
      owner: playerId,
      name: index === 1 ? "Guardian Angel" : "Brutalizer",
      type: "Gear",
      tags: ["Equipment"],
      image: index === 1 ? images.equipment2 : images.equipment,
      attachedTo: host.instanceId,
      exhausted: options.equipmentReadiness === "ready"
        ? false
        : options.equipmentReadiness === "exhausted"
          ? true
          : index === 1 && playerId === "p2",
    });
  });
  const equipment = [...gear, ...looseEquipment, ...attachedEquipment];
  const runeCount = options.runeCount ?? (empty ? 0 : scenario === "stress" ? 12 : 3);
  const runes = Array.from({ length: runeCount }, (_, index) => card({
    id: `${playerId}-rune-${index + 1}`,
    owner: playerId,
    name: index % 2 ? "Order Rune" : "Mind Rune",
    type: "Rune",
    image: index % 2 ? images.runeOrder : images.runeMind,
    exhausted: options.runeMode === "ready" ? false : options.runeMode === "exhausted" ? true : index % 3 === 0,
  }));
  const champion = hasChampion ? [card({ id: `${playerId}-champion`, owner: playerId, name: "Chosen Champion", type: "Unit", image: images.champion, might: 2 })] : [];
  const legend = [card({ id: `${playerId}-legend`, owner: playerId, name: "Lady of Luminosity", type: "Legend", image: images.legend })];
  const trashCount = options.trashCount ?? (empty ? 0 : 1);
  const banishmentCount = options.banishmentCount ?? (empty ? 0 : 1);
  const trash = trashCount > 0 ? [card({ id: `${playerId}-trash-top`, owner: playerId, name: "Trash top card", type: "Unit", image: images.unit3 })] : [];
  const banished = banishmentCount > 0 ? [card({ id: `${playerId}-banish-top`, owner: playerId, name: "Banished top card", type: "Gear", tags: ["Equipment"], image: images.equipment2 })] : [];
  const hand = isViewer && !empty ? [card({ id: `${playerId}-hand-1`, owner: playerId, name: "Hand card", type: "Unit" })] : [];
  return {
    playerId,
    displayName: playerId === "p1" ? "Player" : "Opponent",
    isViewer,
    points: 0,
    energy: 2,
    conditionalEnergy: 0,
    power: { Mind: 1 },
    zones: [
      zone("champion", champion, champion.length),
      zone("legend", legend),
      zone("mainDeck", [], 40, "secret"),
      zone("runeDeck", [], empty ? 0 : 12, "secret"),
      zone("hand", hand, isViewer ? hand.length : empty ? 0 : 5, "private"),
      zone("trash", trash, trashCount),
      zone("banishment", banished, banishmentCount),
      zone("base", [...units, ...equipment, ...runes]),
    ],
  };
}

export function createGameBoardFixture(scenario: GameBoardFixtureScenario, options: GameBoardFixtureOptions = {}): GameProjection {
  const p1 = player("p1", true, scenario, options);
  const p2 = player("p2", false, scenario, options);
  const empty = scenario === "empty";
  const battlefield = (id: string, controller: string, owner: string) => {
    const battlefieldName = scenario === "stress"
      ? id === "arena-1"
        ? "Aspirant's Climb, the Uncharted Noxian Pass"
        : "The Papertree Archive of a Thousand Forgotten Stories"
      : id === "arena-1" ? "Aspirant's Climb" : "The Papertree";
    const battlefieldUnitCount = options.battlefieldUnitCount ?? (empty ? 0 : scenario === "stress" ? 4 : 2);
    const unitTemplates = [
      { might: 3, image: images.unit },
      { might: 2, image: images.unit2 },
      { might: 4, image: images.unit3 },
      { might: 2, image: images.unit2 },
    ];
    const units = Array.from({ length: battlefieldUnitCount }, (_, index) => {
      const template = unitTemplates[index % unitTemplates.length]!;
      return card({
        id: `${id}-unit-${index + 1}`,
        owner,
        name: `Battlefield Unit ${String.fromCharCode(65 + index)}`,
        type: "Unit",
        might: template.might,
        image: template.image,
        exhausted: index % 2 === 1,
      });
    });
    const attachedCards = units.slice(0, Math.min(2, units.length)).map((unit, index) => card({
      id: `${id}-attached-${index + 1}`,
      owner,
      name: "Brutalizer",
      type: "Gear",
      tags: ["Equipment"],
      image: images.equipment,
      attachedTo: unit.instanceId,
      exhausted: index === 1,
    }));
    const showHidden = options.hidden === undefined
      ? scenario !== "empty"
      : options.hidden === "both" || (options.hidden === "owner" && id === "arena-1") || (options.hidden === "opponent" && id === "arena-2");
    return {
      battlefieldId: id,
      selectedByPlayerId: controller,
      controllerPlayerId: controller,
      contestedByPlayerId: id === "arena-1" ? "p2" : null,
      card: card({ id: `${id}-card`, owner: controller, name: battlefieldName, type: "Battlefield", image: images.battlefield }),
      units,
      attachedCards,
      facedownCard: showHidden && controller === "p1" ? card({ id: `${id}-hidden`, owner, name: "Hidden card", type: "Unit", image: images.unit3, might: 3 }) : null,
      facedownCardPresent: showHidden,
    };
  };
  const inShowdown = scenario === "stress";
  return {
    id: "board-fixture-game",
    matchId: "board-fixture-match",
    gameNumber: 1,
    stateVersion: 1,
    status: "in_progress",
    viewerPlayerId: "p1",
    activePlayerId: "p1",
    winnerPlayerId: null,
    victoryScore: 8,
    setup: {
      playerIds: ["p1", "p2"],
      startingPlayerChooserId: "p1",
      startingPlayerId: "p1",
      battlefieldChoices: {},
      mulligans: { p1: { status: "locked" }, p2: { status: "locked" } },
      battlefieldPool: [],
      waitingReason: null,
    },
    turn: { turnNumber: 3, activePlayerId: "p1", phase: "action", passedPlayerIds: [] },
    showdown: inShowdown ? { kind: "combat", battlefieldId: "arena-1", relevantPlayerIds: ["p1", "p2"], focusPlayerId: "p1", priorityPlayerId: "p1", passedPlayerIds: [] } : null,
    combat: inShowdown ? { battlefieldId: "arena-1", stage: "showdown", attackerPlayerId: "p1", defenderPlayerId: "p2", attackerUnitIds: ["arena-1-unit-1"], defenderUnitIds: ["arena-1-unit-2"], attackerMight: 3, defenderMight: 2 } : null,
    pendingChoice: null,
    players: [p1, p2],
    battlefields: [battlefield("arena-1", "p1", "p1"), battlefield("arena-2", "p2", "p2")],
    chain: null,
    actions: [],
    logEntries: [],
  };
}
