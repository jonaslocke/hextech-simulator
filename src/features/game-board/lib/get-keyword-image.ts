import accelerate64 from "../assets/keywords/accelerate-64.webp";
import accelerate128 from "../assets/keywords/accelerate-128.webp";
import action64 from "../assets/keywords/action-64.webp";
import action128 from "../assets/keywords/action-128.webp";
import add64 from "../assets/keywords/add-64.webp";
import add128 from "../assets/keywords/add-128.webp";
import assault64 from "../assets/keywords/assault-64.webp";
import assault128 from "../assets/keywords/assault-128.webp";
import deathknell64 from "../assets/keywords/deathknell-64.webp";
import deathknell128 from "../assets/keywords/deathknell-128.webp";
import deflect64 from "../assets/keywords/deflect-64.webp";
import deflect128 from "../assets/keywords/deflect-128.webp";
import equip64 from "../assets/keywords/equip-64.webp";
import equip128 from "../assets/keywords/equip-128.webp";
import ganking64 from "../assets/keywords/ganking-64.webp";
import ganking128 from "../assets/keywords/ganking-128.webp";
import hidden64 from "../assets/keywords/hidden-64.webp";
import hidden128 from "../assets/keywords/hidden-128.webp";
import legion64 from "../assets/keywords/legion-64.webp";
import legion128 from "../assets/keywords/legion-128.webp";
import mighty64 from "../assets/keywords/mighty-64.webp";
import mighty128 from "../assets/keywords/mighty-128.webp";
import quickDraw64 from "../assets/keywords/quick-draw-64.webp";
import quickDraw128 from "../assets/keywords/quick-draw-128.webp";
import reaction64 from "../assets/keywords/reaction-64.webp";
import reaction128 from "../assets/keywords/reaction-128.webp";
import repeat64 from "../assets/keywords/repeat-64.webp";
import repeat128 from "../assets/keywords/repeat-128.webp";
import shield64 from "../assets/keywords/shield-64.webp";
import shield128 from "../assets/keywords/shield-128.webp";
import tank64 from "../assets/keywords/tank-64.webp";
import tank128 from "../assets/keywords/tank-128.webp";
import temporary64 from "../assets/keywords/temporary-64.webp";
import temporary128 from "../assets/keywords/temporary-128.webp";
import vision64 from "../assets/keywords/vision-64.webp";
import vision128 from "../assets/keywords/vision-128.webp";
import weaponmaster64 from "../assets/keywords/weaponmaster-64.webp";
import weaponmaster128 from "../assets/keywords/weaponmaster-128.webp";

export const cardKeywords = [
  "accelerate",
  "action",
  "add",
  "assault",
  "deathknell",
  "deflect",
  "equip",
  "ganking",
  "hidden",
  "legion",
  "mighty",
  "quick-draw",
  "reaction",
  "repeat",
  "shield",
  "tank",
  "temporary",
  "vision",
  "weaponmaster",
] as const;

export type CardKeyword = (typeof cardKeywords)[number];

type Size = "md" | "lg";
type KeywordAsset = typeof accelerate64;

const keywordAssets: Record<CardKeyword, Record<Size, KeywordAsset>> = {
  accelerate: { md: accelerate64, lg: accelerate128 },
  action: { md: action64, lg: action128 },
  add: { md: add64, lg: add128 },
  assault: { md: assault64, lg: assault128 },
  deathknell: { md: deathknell64, lg: deathknell128 },
  deflect: { md: deflect64, lg: deflect128 },
  equip: { md: equip64, lg: equip128 },
  ganking: { md: ganking64, lg: ganking128 },
  hidden: { md: hidden64, lg: hidden128 },
  legion: { md: legion64, lg: legion128 },
  mighty: { md: mighty64, lg: mighty128 },
  "quick-draw": { md: quickDraw64, lg: quickDraw128 },
  reaction: { md: reaction64, lg: reaction128 },
  repeat: { md: repeat64, lg: repeat128 },
  shield: { md: shield64, lg: shield128 },
  tank: { md: tank64, lg: tank128 },
  temporary: { md: temporary64, lg: temporary128 },
  vision: { md: vision64, lg: vision128 },
  weaponmaster: { md: weaponmaster64, lg: weaponmaster128 },
};

export function getKeywordImage({
  keyword,
  size = "md",
}: {
  keyword: CardKeyword;
  size?: Size;
}) {
  return keywordAssets[keyword][size].src;
}
