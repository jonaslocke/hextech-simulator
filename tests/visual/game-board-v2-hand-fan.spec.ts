import { expect, test } from "@playwright/test";

for (const scenario of [
  { expectedCards: 4, variant: "hand-small", viewport: { width: 1440, height: 900 } },
  { expectedCards: 16, variant: "hand-large", viewport: { width: 1680, height: 1400 } }
] as const) {
  test(`v2 ${scenario.variant} supports pointer and keyboard selection`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: scenario.viewport });
    const page = await context.newPage();
    await page.goto(`/visual-parity/v2?variant=${scenario.variant}`);
    await page.waitForLoadState("networkidle");

    const hand = page.getByRole("listbox", { name: "Player hand" });
    const options = hand.getByRole("option");
    await expect(options).toHaveCount(scenario.expectedCards);

    await hand.focus();
    await expect(hand).toHaveAttribute("data-active-index", "0");
    await expect(hand).toHaveAttribute(
      "aria-activedescendant",
      /p1-hand-card-/
    );

    await hand.press("End");
    await expect(hand).toHaveAttribute(
      "data-active-index",
      String(scenario.expectedCards - 1)
    );
    await hand.press("Home");
    await hand.press("ArrowRight");
    await expect(hand).toHaveAttribute("data-active-index", "1");

    const bounds = await hand.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.width).toBeLessThanOrEqual(1080);
    expect(bounds!.width).toBeLessThanOrEqual(scenario.viewport.width);

    await page.mouse.move(
      bounds!.x + bounds!.width / 2,
      bounds!.y + bounds!.height / 2
    );
    await expect(hand).toHaveAttribute("data-active-index", /\d+/);

    await hand.click({ position: { x: bounds!.width / 2, y: bounds!.height / 2 } });
    await expect(page.getByRole("button", { name: "Not playable" })).toBeVisible();

    await context.close();
  });
}
