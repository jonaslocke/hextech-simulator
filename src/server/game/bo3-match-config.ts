export const BO3_MATCH_FEATURES = {
  enableDeckReconfigurationBetweenGames: false,
  readyWithCurrentDeckConfiguration: true,
} as const;

const enabledBetweenGamesModes = [
  BO3_MATCH_FEATURES.enableDeckReconfigurationBetweenGames,
  BO3_MATCH_FEATURES.readyWithCurrentDeckConfiguration,
].filter(Boolean).length;

if (enabledBetweenGamesModes !== 1) {
  throw new Error(
    "Exactly one BO3 between-games deck submission mode must be enabled.",
  );
}
