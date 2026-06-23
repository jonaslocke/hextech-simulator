export const runtimeCoverageStatuses = ["planned", "executable", "deferred"] as const;

export type RuntimeCoverageStatus = (typeof runtimeCoverageStatuses)[number];

export const GAME_V2_RUNTIME_COVERAGE = {
  "ability.exhaust_for_resource": "planned",
  "ability.recycle_for_power": "planned",
  "timing.action": "planned",
  "timing.reaction": "planned",
  "timing.delayed": "planned",
  "trigger.on_play": "planned",
  "trigger.conquer_battlefield": "planned",
  "trigger.hold_battlefield": "planned",
  "condition.compare_numeric_value": "planned",
  "selector.unit": "planned",
  "selector.friendly_unit": "planned",
  "action.draw_cards": "planned",
  "action.ready_cards": "planned",
  "action.channel_runes": "planned",
  "action.deal_damage": "planned",
  "action.kill_unit": "planned",
  "modifier.modify_numeric_value": "planned",
  "modifier.enter_ready": "planned",
  "keyword.assault": "deferred",
  "keyword.tank": "deferred"
} as const satisfies Record<string, RuntimeCoverageStatus>;

export function getRuntimeCoverageStatus(
  behaviorId: string
): RuntimeCoverageStatus | null {
  return GAME_V2_RUNTIME_COVERAGE[
    behaviorId as keyof typeof GAME_V2_RUNTIME_COVERAGE
  ] ?? null;
}

