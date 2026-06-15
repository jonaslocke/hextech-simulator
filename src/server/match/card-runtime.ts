import type { Card } from "../catalog";

export type UnitPlayProfile =
  | {
      supported: true;
      entersReady?: boolean;
      onPlay?: {
        type: "draw";
        count: number;
      };
    }
  | {
      supported: false;
      reason: string;
    };

const knownUnitProfiles: Record<string, UnitPlayProfile> = {
  "Annie, Fiery": {
    supported: true
  },
  "Annie, Stubborn": {
    supported: false,
    reason: "Choose-based on-play effects are not implemented."
  },
  "Daring Poro": {
    supported: true
  },
  "Eager Apprentice": {
    supported: true
  },
  "Lecturing Yordle": {
    supported: true,
    onPlay: {
      type: "draw",
      count: 1
    }
  },
  "Lux, Crownguard": {
    supported: true
  },
  "Lux, Illuminated": {
    supported: true
  },
  "Maddened Marauder": {
    supported: false,
    reason: "Choose-based on-play effects are not implemented."
  },
  "Mega-Mech": {
    supported: true
  },
  "Mystic Poro": {
    supported: false,
    reason: "Vision choices are not implemented."
  },
  "Pouty Poro": {
    supported: true
  },
  "Ravenbloom Student": {
    supported: true
  },
  "Sai Scout": {
    supported: false,
    reason: "Vision choices are not implemented."
  },
  "Sneaky Deckhand": {
    supported: true
  },
  Tibbers: {
    supported: false,
    reason: "Damage-on-play effects are not implemented."
  },
  "Traveling Merchant": {
    supported: true
  },
  "Vanguard Attendant": {
    supported: true,
    entersReady: true
  },
  "Vanguard Sergeant": {
    supported: true
  }
};

export function getUnitPlayProfile(card: Card): UnitPlayProfile {
  const knownProfile = knownUnitProfiles[card.name];

  if (knownProfile) {
    return knownProfile;
  }

  if (card.classification.type !== "Unit") {
    return {
      supported: false,
      reason: "Only Unit card play to base is supported."
    };
  }

  if (card.text.plain.trim().length === 0) {
    return {
      supported: true
    };
  }

  return {
    supported: false,
    reason: "This card's runtime behavior is not implemented."
  };
}
