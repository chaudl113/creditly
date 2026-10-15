import { expect, test } from "@playwright/test";

/**
 * Public demo mode. Needs a server started with DEMO_PUBLIC=1:
 *   DEMO_PUBLIC=1 npm run dev   (then)   npm run e2e:demo
 * Each test sends its own X-Forwarded-For so the per-IP limits stay isolated.
 */
const SEARCH = "Search name or email…";
const fakeIp = () => `203.0.113.${Math.floor(Math.random() * 250) + 1}`;

test.beforeEach(async ({ page, context }) => {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": fakeIp() });
  await page.goto("/login");
  test.skip(!(await page.getByTestId("demo-customer").isVisible()), "server is not running with DEMO_PUBLIC=1");
});

test("one-click customer sign-in; URL summaries are off", async ({ page }) => {
  await page.getByTestId("demo-customer").click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByTestId("current-user")).toContainText("ava@demo.creditly.test");
  await page.goto("/app/summarize");
  await page.getByRole("tab", { name: "URL" }).click();
  await expect(page.getByTestId("url-disabled")).toBeVisible();
  await expect(page.getByTestId("summarize-submit")).toBeDisabled();
});

test("one-click admin sign-in; visitor emails are masked", async ({ page }) => {
  await page.getByTestId("demo-admin").click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/admin/users");
  // Accounts created by e2e runs and visitors show up masked.
  await expect(page.getByText(/^\w\*\*\*@\w\*\*\*\./).first()).toBeVisible();
  await page.getByPlaceholder(SEARCH).fill("ava@");
  await expect(page.getByText("ava@demo.creditly.test")).toBeVisible();
});

test("forgot password sends nothing in the public demo", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill("ava@demo.creditly.test");
  await page.getByRole("button", { name: /reset link/i }).click();
  await expect(page.getByText("This is a public demo, so no email is sent.")).toBeVisible();
});

test("login attempts are rate-limited per IP", async ({ page }) => {
  const alert = page.locator('[data-slot="alert"]');
  for (let i = 0; i < 21; i++) {
    await page.getByLabel("Email").fill("nobody@example.com");
    await page.getByLabel("Password", { exact: true }).fill("wrong-password");
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST"),
      page.getByRole("button", { name: "Log in", exact: true }).click(),
    ]);
    if (i < 20) await expect(alert).toContainText("Wrong email or password");
  }
  await expect(alert).toContainText("Too many attempts");
});
