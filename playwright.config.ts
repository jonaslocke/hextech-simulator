import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/visual",
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:3000",
    colorScheme: "dark"
  },
  webServer: {
    command: "npm run next:dev",
    env: { ...process.env, VISUAL_PARITY: "1" },
    reuseExistingServer: false,
    url: "http://127.0.0.1:3000",
    timeout: 120_000
  }
});
