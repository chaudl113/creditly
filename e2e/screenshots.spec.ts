import { expect, test, type Browser, type Page } from "@playwright/test";
import { ADMIN, logIn, SAMPLE } from "./helpers";

/**
 * Captures the main screens into docs/screenshots at desktop (1440) and
 * mobile (390) widths, plus the product shots used on the landing page
 * (public/landing). Uses the seeded demo accounts; run after `npm run seed`
 * (docker compose does it on start).
 */
const DEMO_USER = { email: "ava@demo.creditly.test", password: "demo-password" };
const OUT = "docs/screenshots";
const VIEWPORTS = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1 },
  mobile: { width: 390, height: 844, deviceScaleFactor: 2 },
} as const;

type Shot = { name: string; as?: "user" | "admin"; dark?: boolean; prepare: (page: Page) => Promise<void> };

const SHOTS: Shot[] = [
  { name: "landing", prepare: (p) => p.goto("/").then(() => undefined) },
  { name: "landing-dark", dark: true, prepare: (p) => p.goto("/").then(() => undefined) },
  { name: "pricing", prepare: (p) => p.goto("/pricing").then(() => undefined) },
  { name: "login", prepare: (p) => p.goto("/login").then(() => undefined) },
  { name: "dashboard", as: "user", prepare: (p) => p.goto("/app").then(() => undefined) },
  { name: "dashboard-dark", as: "user", dark: true, prepare: (p) => p.goto("/app").then(() => undefined) },
  {
    name: "summarize",
    as: "user",
    prepare: async (p) => {
      await p.goto("/app/summarize");
      await p.getByLabel("Text to summarize").fill(SAMPLE);
      await p.getByTestId("summarize-submit").click();
      await expect(p.getByTestId("job-result")).toBeVisible();
    },
  },
  { name: "billing", as: "user", prepare: (p) => p.goto("/app/billing").then(() => undefined) },
  {
    name: "test-checkout",
    as: "user",
    prepare: async (p) => {
      await p.goto("/app/billing");
      await p.getByTestId("buy-pack_500").click();
      await expect(p).toHaveURL(/test-checkout/);
    },
  },
  { name: "admin-overview", as: "admin", prepare: (p) => p.goto("/admin").then(() => undefined) },
  { name: "admin-overview-dark", as: "admin", dark: true, prepare: (p) => p.goto("/admin").then(() => undefined) },
  { name: "admin-users", as: "admin", prepare: (p) => p.goto("/admin/users").then(() => undefined) },
  {
    name: "admin-user",
    as: "admin",
    prepare: async (p) => {
      await p.goto("/admin/users");
      await p.getByLabel("Search users").fill("chloe@demo");
      await p.getByRole("link", { name: /Chloe Martin/ }).click();
      await expect(p.getByTestId("admin-user-balance")).toBeVisible();
    },
  },
  {
    name: "admin-refund-dialog",
    as: "admin",
    prepare: async (p) => {
      await p.goto("/admin/users");
      await p.getByLabel("Search users").fill("chloe@demo");
      await p.getByRole("link", { name: /Chloe Martin/ }).click();
      await p.getByTestId("refund-payment").first().click();
      await expect(p.getByRole("dialog")).toBeVisible();
      await p.getByLabel("Reason").fill("Customer was charged twice");
    },
  },
  { name: "admin-ledger", as: "admin", prepare: (p) => p.goto("/admin/ledger").then(() => undefined) },
  { name: "admin-webhooks", as: "admin", prepare: (p) => p.goto("/admin/webhooks").then(() => undefined) },
  { name: "admin-audit", as: "admin", prepare: (p) => p.goto("/admin/audit").then(() => undefined) },
];

/** Waits for every visible <img> (next/image optimises on first request in dev). */
async function imagesLoaded(page: Page) {
  await page.waitForFunction(() =>
    [...document.images].every((img) => !img.checkVisibility() || (img.complete && img.naturalWidth > 0)),
  );
}

type Viewport = { width: number; height: number; deviceScaleFactor: number };

async function pageFor(browser: Browser, shot: Shot, vp: Viewport) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.deviceScaleFactor,
    colorScheme: shot.dark ? "dark" : "light",
    isMobile: vp.width < 500,
    hasTouch: vp.width < 500,
  });
  // A distinct client IP per context keeps public-demo login limits out of the way.
  await context.setExtraHTTPHeaders({ "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 250) + 1}` });
  const page = await context.newPage();
  if (shot.as === "user") await logIn(page, DEMO_USER.email, DEMO_USER.password);
  if (shot.as === "admin") await logIn(page, ADMIN.email, ADMIN.password);
  return page;
}

for (const [label, vp] of Object.entries(VIEWPORTS)) {
  for (const shot of SHOTS) {
    if (shot.dark && label === "mobile") continue;
    test(`${shot.name} @ ${label}`, async ({ browser }) => {
      const page = await pageFor(browser, shot, vp);
      await shot.prepare(page);
      await page.waitForLoadState("networkidle");
      await page.evaluate(() => document.fonts.ready);
      const dialogOpen = await page.getByRole("dialog").isVisible();
      if (!dialogOpen) {
        // Grow the viewport to the page so fixed sidebars/headers render once, in place.
        const height = await page.evaluate(() => document.documentElement.scrollHeight);
        await page.setViewportSize({ width: vp.width, height: Math.min(Math.max(height, vp.height), 4200) });
      }
      await imagesLoaded(page);
      await page.screenshot({ path: `${OUT}/${shot.name}-${label}.png`, animations: "disabled" });
      await page.context().close();
    });
  }
}

/** Landing-page product shots: one browser window's worth, light and dark, at 2x. */
const HERO: Shot[] = [
  {
    name: "summarize",
    as: "user",
    prepare: async (p) => {
      await SHOTS.find((s) => s.name === "summarize")!.prepare(p);
      // Opaque header, so the scrolled-away form doesn't blur through it.
      await p.addStyleTag({ content: "header { backdrop-filter: none !important; background: var(--background) !important; }" });
      await p.evaluate(() => {
        const top = document.querySelector('[data-testid="job-result"]')!.getBoundingClientRect().top;
        window.scrollBy(0, top - 72);
      });
    },
  },
  { name: "admin", as: "admin", prepare: (p) => p.goto("/admin").then(() => undefined) },
];

for (const shot of HERO) {
  for (const dark of [false, true]) {
    test(`landing ${shot.name} @ ${dark ? "dark" : "light"}`, async ({ browser }) => {
      const page = await pageFor(browser, { ...shot, dark }, { width: 1440, height: 900, deviceScaleFactor: 2 });
      await shot.prepare(page);
      await page.waitForLoadState("networkidle");
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: `public/landing/${shot.name}-${dark ? "dark" : "light"}.jpg`,
        type: "jpeg",
        quality: 85,
        animations: "disabled",
      });
      await page.context().close();
    });
  }
}
