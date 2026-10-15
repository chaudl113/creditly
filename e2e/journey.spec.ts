import { expect, test } from "@playwright/test";
import { ADMIN, buy, logIn, SAMPLE, signUp } from "./helpers";

test("sign up → buy credits → run AI → admin sees it all", async ({ browser }) => {
  const email = `e2e-${Date.now()}@example.com`;
  const user = await browser.newPage();

  await test.step("sign up gets the free credits", async () => {
    await signUp(user, "E2E Customer", email);
    await expect(user.getByTestId("credit-balance")).toHaveText("50");
  });

  await test.step("non-admins are kept out of /admin", async () => {
    await user.goto("/admin");
    await expect(user).toHaveURL(/\/app$/);
  });

  await test.step("buying a pack (webhooks delivered twice, out of order) credits once", async () => {
    await buy(user, "pack_500", { flaky: true });
    await expect(user.getByTestId("credit-balance")).toHaveText("550");
  });

  await test.step("subscribing to Pro grants the monthly allowance", async () => {
    await buy(user, "pro");
    await expect(user.getByTestId("credit-balance")).toHaveText("1,550");
    await expect(user.getByTestId("current-plan")).toHaveText("Pro");
  });

  let charged = 0;
  await test.step("a summary run charges credits for the tokens used", async () => {
    await user.goto("/app/summarize");
    await user.getByLabel("Text to summarize").fill(SAMPLE);
    await user.getByTestId("summarize-submit").click();
    await expect(user.getByTestId("job-result")).toBeVisible();
    await expect(user.getByTestId("extracted-table")).toBeVisible();
    charged = Number((await user.getByTestId("credits-charged").textContent())!.match(/\d+/)![0]);
    expect(charged).toBeGreaterThan(0);
    await expect(user.getByTestId("credit-balance")).toHaveText((1550 - charged).toLocaleString("en-US"));
  });

  if (await user.getByTestId("demo-mode").isVisible()) {
    await test.step("a failed run is refunded in full (demo provider)", async () => {
      await user.getByLabel("Text to summarize").fill(`${SAMPLE} [fail]`);
      await user.getByTestId("summarize-submit").click();
      await expect(user.getByTestId("job-refund")).toBeVisible();
      await expect(user.getByTestId("credit-balance")).toHaveText((1550 - charged).toLocaleString("en-US"));
    });
  }

  const admin = await (await browser.newContext()).newPage();
  await test.step("admin finds the customer with balance, plan and spend", async () => {
    await logIn(admin, ADMIN.email, ADMIN.password);
    await admin.goto("/admin/users");
    await admin.getByLabel("Search users").fill(email);
    const row = admin.getByTestId("admin-user-row");
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("Pro");
    await expect(row).toContainText((1550 - charged).toLocaleString("en-US"));
    await expect(row).toContainText("$28.00");
  });

  await test.step("admin sees the payments and the AI run on the user page", async () => {
    await admin.getByRole("link", { name: /E2E Customer/ }).click();
    await expect(admin.getByTestId("admin-payment-row")).toHaveCount(2);
    await admin.getByRole("tab", { name: /AI runs/ }).click();
    await expect(admin.getByRole("tabpanel")).toContainText("succeeded");
  });

  await test.step("admin refunds half of the pack; credits are reclaimed and audited", async () => {
    const before = Number((await admin.getByTestId("admin-user-balance").textContent())!.replace(/,/g, ""));
    await admin.getByTestId("admin-payment-row").filter({ hasText: "500 credit pack" }).getByTestId("refund-payment").click();
    await admin.getByLabel("Amount (USD)").fill("4.50");
    await admin.getByLabel("Reason").fill("E2E: customer asked for a partial refund");
    await admin.getByTestId("admin-dialog-submit").click();
    await expect(admin.getByRole("dialog")).toBeHidden();
    await expect(admin.getByTestId("admin-user-balance")).toHaveText((before - 250).toLocaleString("en-US"));
    await admin.goto("/admin/audit");
    await expect(admin.getByTestId("audit-row").first()).toContainText("E2E: customer asked for a partial refund");
  });

  await test.step("the ledger still balances and webhook duplicates were absorbed", async () => {
    await admin.goto("/admin/ledger");
    await expect(admin.getByTestId("trial-balance-total")).toHaveText("0");
    await admin.goto("/admin/webhooks");
    await expect(admin.getByTestId("webhook-row").filter({ hasText: "duplicate" }).first()).toBeVisible();
  });
});
