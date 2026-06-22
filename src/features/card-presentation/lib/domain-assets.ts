import bodyRune from "../assets/domains/body-16.webp";
import calmRune from "../assets/domains/calm-16.webp";
import chaosRune from "../assets/domains/chaos-16.webp";
import furyRune from "../assets/domains/fury-16.webp";
import mindRune from "../assets/domains/mind-16.webp";
import orderRune from "../assets/domains/order-16.webp";
import rainbowRune from "../assets/domains/rainbow-16.webp";

const domainIcons: Record<string, string> = {
  body: bodyRune.src,
  calm: calmRune.src,
  chaos: chaosRune.src,
  fury: furyRune.src,
  mind: mindRune.src,
  order: orderRune.src,
  rainbow: rainbowRune.src,
};

export function getDomainIconPath(domain: string) {
  return domainIcons[domain.toLowerCase()] ?? null;
}
