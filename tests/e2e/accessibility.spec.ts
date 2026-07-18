import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const routes = [
  "/",
  "/fixtures",
  "/demo",
  "/receipt",
  "/create/18241006",
  "/legal",
];

for (const route of routes) {
  test(`${route} has no critical accessibility violations`, async ({
    page,
  }) => {
    await page.goto(route);
    await expect(page.locator("main").first()).toBeVisible();
    const scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      scan.violations.filter((violation) => violation.impact === "critical"),
    ).toEqual([]);
  });
}

for (const viewport of [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
]) {
  test(`core financial surfaces fit the ${viewport.name} viewport`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    for (const route of ["/demo", "/create/18241006", "/receipt", "/legal"]) {
      await page.goto(route);
      await expect(page.getByLabel("Prototype notice")).toContainText(
        "no monetary value",
      );
      const sizes = await page.evaluate(() => ({
        content: document.documentElement.scrollWidth,
        viewport: document.documentElement.clientWidth,
      }));
      expect(
        sizes.content,
        `${route} overflowed at ${viewport.width}px`,
      ).toBeLessThanOrEqual(sizes.viewport);
    }
  });
}
