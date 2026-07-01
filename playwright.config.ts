import { defineConfig } from "@playwright/test";

const port = process.env.PLAYWRIGHT_PORT ?? "3000";

export default defineConfig({
  testDir: "./tests/visual",
  fullyParallel: false,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    colorScheme: "dark"
  },
  webServer: {
    command: `npm run next:dev -- -p ${port}`,
    env: { ...process.env, VISUAL_PARITY: "1" },
    reuseExistingServer: false,
    url: `http://127.0.0.1:${port}`,
    timeout: 120_000
  }
});
