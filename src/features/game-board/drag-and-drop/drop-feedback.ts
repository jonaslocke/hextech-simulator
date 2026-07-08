import type { BoardLocationDropStatus } from "./location-drag-actions";

export function boardLocationDropFeedbackClassName(
  status: BoardLocationDropStatus | undefined,
) {
  switch (status) {
    case "legal":
      return "ring-1 ring-cyan-300/55 bg-cyan-300/[0.04] shadow-[0_0_18px_rgba(103,232,249,0.12)]";
    case "legal-over":
      return "ring-2 ring-emerald-300/90 bg-emerald-300/[0.08] shadow-[0_0_24px_rgba(110,231,183,0.28)]";
    case "invalid-over":
      return "ring-2 ring-rose-300/70 bg-rose-500/[0.06] shadow-[0_0_18px_rgba(251,113,133,0.16)]";
    case "idle":
    default:
      return "";
  }
}
