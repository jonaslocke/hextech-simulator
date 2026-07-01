import assert from "node:assert/strict";
import { test } from "@playwright/test";

for (const viewport of [{ width: 1680, height: 1400 }, { width: 1440, height: 900 }]) {
  for (const variant of ["normal", "chain", "showdown"] as const) {
    test(`${variant} board is pixel-identical at ${viewport.width}x${viewport.height}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport });
      const legacy = await context.newPage();
      const v2 = await context.newPage();
      await Promise.all([
        legacy.goto(`/visual-parity/legacy?variant=${variant}`),
        v2.goto(`/visual-parity/v2?variant=${variant}`)
      ]);
      await Promise.all([legacy.waitForLoadState("networkidle"), v2.waitForLoadState("networkidle")]);
      await Promise.all([
        legacy.addStyleTag({ content: '[data-zone-animation-id$=":hand"] { visibility: hidden !important; }' }),
        v2.addStyleTag({ content: '[data-zone-animation-id$=":hand"] { visibility: hidden !important; }' })
      ]);
      const [legacyImage, v2Image] = await Promise.all([legacy.screenshot(), v2.screenshot()]);
      assert.equal(Buffer.compare(v2Image, legacyImage), 0, "Legacy and v2 screenshots differ");
      await context.close();
    });
  }
}
