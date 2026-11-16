import { expect, test } from "@playwright/test";

test("loads the FontScope workspace and local-first privacy controls", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByRole("heading", { name: /know your type/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Local Font Library" })).toBeVisible();
  await expect(page.getByRole("link", { name: "PRIVACY" })).toBeVisible();
});

test("requests installed-font metadata only after the scan button is clicked", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "queryLocalFonts", {
      configurable: true,
      value: async () => [{
        family: "FontScope Mock Sans",
        fullName: "FontScope Mock Sans Regular",
        postscriptName: "FontScopeMockSans-Regular",
        style: "Regular",
      }],
    });
  });

  await page.goto("./");
  await page.getByRole("button", { name: /scan my installed fonts/i }).click();
  await expect(page.getByText(/Found 1 installed font faces/)).toBeVisible();
  await expect(page.locator(".local-font-card")).toContainText("FontScope Mock Sans");
});

test("rejects a file whose bytes do not match its font extension", async ({ page }) => {
  await page.goto("./");
  await page.locator("#files").setInputFiles({
    name: "not-a-font.ttf",
    mimeType: "font/ttf",
    buffer: Buffer.from("not a font"),
  });
  await expect(page.getByText(/does not contain a valid TTF font signature/)).toBeVisible();
  await expect(page.locator(".file-list")).not.toContainText("not-a-font.ttf");
});

test("opens the standalone privacy notice", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("link", { name: "PRIVACY" }).click();
  await expect(page).toHaveURL(/privacy\.html$/);
  await expect(page.getByRole("heading", { name: "Privacy notice" })).toBeVisible();
});
