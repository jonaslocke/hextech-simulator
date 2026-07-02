export const runtimeCoverageStatuses = ["planned", "executable", "deferred"] as const;

export type RuntimeCoverageStatus = (typeof runtimeCoverageStatuses)[number];

export const GAME__RUNTIME_COVERAGE = {
  "ability.exhaust_for_resource": "executable",
  "ability.recycle_for_power": "executable",
  "timing.action": "executable",
  "timing.reaction": "executable",
  "timing.delayed": "executable",
  "trigger.on_play": "executable",
  "trigger.conquer_battlefield": "executable",
  "trigger.hold_battlefield": "executable",
  "condition.compare_numeric_value": "executable",
  "selector.unit": "executable",
  "selector.friendly_unit": "executable",
  "action.draw_cards": "executable",
  "action.ready_cards": "executable",
  "action.channel_runes": "executable",
  "action.deal_damage": "executable",
  "action.kill_unit": "executable",
  "modifier.modify_numeric_value": "executable",
  "modifier.enter_ready": "executable",
  "keyword.assault": "deferred",
  "keyword.tank": "deferred"
} as const satisfies Record<string, RuntimeCoverageStatus>;

export function getRuntimeCoverageStatus(
  behaviorId: string
): RuntimeCoverageStatus | null {
  return GAME__RUNTIME_COVERAGE[
    behaviorId as keyof typeof GAME__RUNTIME_COVERAGE
  ] ?? null;
}
