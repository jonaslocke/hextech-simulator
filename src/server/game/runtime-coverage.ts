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
  "trigger.on_move": "executable",
  "trigger.end_of_turn": "executable",
  "condition.compare_numeric_value": "executable",
  "condition.effect_killed_target": "executable",
  "selector.unit": "executable",
  "selector.friendly_unit": "executable",
  "selector.enemy_unit": "executable",
  "selector.card": "executable",
  "selector.battlefield": "executable",
  "action.draw_cards": "executable",
  "action.discard_cards": "executable",
  "action.ready_cards": "executable",
  "action.channel_runes": "executable",
  "action.deal_damage": "executable",
  "action.kill_unit": "executable",
  "action.return_to_hand": "executable",
  "action.move_unit": "executable",
  "modifier.modify_numeric_value": "executable",
  "modifier.enter_ready": "executable",
  "trigger.attack": "executable",
  "trigger.defend": "executable",
  "keyword.assault": "executable",
  "keyword.shield": "executable",
  "keyword.tank": "executable"
} as const satisfies Record<string, RuntimeCoverageStatus>;

export function getRuntimeCoverageStatus(
  behaviorId: string
): RuntimeCoverageStatus | null {
  return GAME__RUNTIME_COVERAGE[
    behaviorId as keyof typeof GAME__RUNTIME_COVERAGE
  ] ?? null;
}
