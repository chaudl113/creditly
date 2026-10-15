import { expect, type Page } from "@playwright/test";

export const ADMIN = {
  email: "admin@creditly.test",
  password: process.env.SEED_ADMIN_PASSWORD ?? "admin-demo-1234",
};

export async function signUp(page: Page, name: string, email: string, password = "password123") {
  await page.goto("/signup");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/app/);
}

export async function logIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/app/);
}

/** Pays a test checkout on the local Stripe simulator (stripe-mock mode). */
export async function buy(page: Page, product: "pack_500" | "pro", opts: { flaky?: boolean } = {}) {
  await page.goto("/app/billing");
  await page.getByTestId(`buy-${product}`).click();
  await expect(page).toHaveURL(/\/billing\/test-checkout\//);
  if (opts.flaky) await page.getByLabel("Simulate a flaky network").check();
  await page.getByTestId("pay-test-checkout").click();
  await expect(page).toHaveURL(/checkout=success/);
}

export const SAMPLE = `Northwind Analytics reported third-quarter revenue of $48.2 million on October 14, up 23% from a year earlier. Subscription revenue made up $41.7 million. The company ended the quarter with 1,240 enterprise customers and raised its full-year guidance to $190 million.`;
