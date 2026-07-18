import { expect, test } from "@playwright/test";

import { mockGoldenReplay, tabTo } from "./helpers";

test.beforeEach(async ({ page }) => {
  await mockGoldenReplay(page);
});

test("judge completes the wallet-free golden path", async ({ page }) => {
  await page.goto("/demo");
  await page.getByRole("button", { name: /use this fixture/i }).click();
  await page.getByRole("button", { name: /use this condition/i }).click();
  await page
    .getByRole("button", { name: /join yes with 1 demo token/i })
    .click();
  await page.getByRole("button", { name: /start replay/i }).click();
  const settlement = page.getByRole("button", { name: /inspect settlement/i });
  await expect(settlement).toBeEnabled();
  await settlement.click();
  await expect(page.getByText("Verified", { exact: true })).toBeVisible();
  await expect(page.getByText("Solana devnet", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: /inspect settlement on solana/i }),
  ).toHaveAttribute("href", /cluster=devnet/);
});

test("judge completes the same path with only the keyboard", async ({
  page,
}) => {
  await page.goto("/demo");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: /skip to main content/i }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();

  await tabTo(page, /Use this fixture/i);
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: /use this condition/i }),
  ).toBeVisible();
  await tabTo(page, /Use this condition/i);
  await page.keyboard.press("Enter");
  await tabTo(page, /Join YES with 1 demo token/i);
  await page.keyboard.press("Enter");
  await tabTo(page, /Start replay/i);
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: /inspect settlement/i }),
  ).toBeEnabled();
  await tabTo(page, /Inspect settlement/i);
  await page.keyboard.press("Enter");
  await expect(page.getByLabel(/verified on solana devnet/i)).toBeVisible();
});
