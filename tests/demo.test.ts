import { count, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aiJobs, users } from "@/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { DemoProvider } from "@/lib/ai/demo";
import { runSummarize } from "@/lib/ai/jobs";
import { SIGNUP_CREDITS } from "@/lib/billing/catalog";
import { DEMO_ACCOUNTS, displayEmail, isProtectedDemoAccount } from "@/lib/demo";
import { sendMail } from "@/lib/mail";
import { getUserBalance } from "@/lib/ledger";
import { clientIp, hit } from "@/lib/rate-limit";
import { requestPasswordReset, resetPassword } from "@/lib/users";
import { makeUser, resetDb, testDb } from "./helpers";

vi.mock("@/lib/mail", () => ({ sendMail: vi.fn(async () => {}) }));

const db = testDb();
beforeEach(async () => {
  await resetDb();
  vi.mocked(sendMail).mockClear();
});
afterEach(() => vi.unstubAllEnvs());
const demoOn = () => vi.stubEnv("DEMO_PUBLIC", "1");

describe("rate limit", () => {
  const limit = { max: 3, windowMs: 60_000 };
  const t0 = new Date("2026-10-15T10:00:05Z");

  it("allows max hits per window, then blocks until the next window", async () => {
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await hit(db, "login:1.2.3.4", limit, t0));
    expect(results).toEqual([true, true, true, false, false]);
    expect(await hit(db, "login:1.2.3.4", limit, new Date(t0.getTime() + 60_000))).toBe(true);
  });

  it("counts each key separately", async () => {
    for (let i = 0; i < 3; i++) await hit(db, "login:1.1.1.1", limit, t0);
    expect(await hit(db, "login:1.1.1.1", limit, t0)).toBe(false);
    expect(await hit(db, "login:2.2.2.2", limit, t0)).toBe(true);
    expect(await hit(db, "signup:1.1.1.1", limit, t0)).toBe(true);
  });

  it("is safe under concurrent hits (one upsert per request)", async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => hit(db, "race", limit, t0)));
    expect(results.filter(Boolean)).toHaveLength(3);
  });

  it("reads the client IP from the configured proxy header", () => {
    const h = new Headers({ "x-forwarded-for": "9.9.9.9, 10.0.0.1", "cf-connecting-ip": "8.8.8.8" });
    expect(clientIp(h)).toBe("9.9.9.9");
    vi.stubEnv("CLIENT_IP_HEADER", "cf-connecting-ip");
    expect(clientIp(h)).toBe("8.8.8.8");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

describe("public demo mode", () => {
  it("refuses URL summaries before reserving credits", async () => {
    demoOn();
    const user = await makeUser();
    await expect(
      runSummarize(db, user.id, { kind: "url", url: "http://127.0.0.1:5432/" }, new DemoProvider()),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const [{ jobs }] = await db.select({ jobs: count() }).from(aiJobs);
    expect(jobs).toBe(0);
    expect(await getUserBalance(db, user.id)).toBe(SIGNUP_CREDITS);
    // Pasted text still works.
    const job = await runSummarize(db, user.id, { kind: "text", text: "Demo data. Revenue grew 18% to $4.2 million in the third quarter of 2026." }, new DemoProvider());
    expect(job.status).toBe("succeeded");
  });

  it("protects the shared demo accounts only when demo mode is on", () => {
    expect(isProtectedDemoAccount(DEMO_ACCOUNTS.admin)).toBe(false);
    demoOn();
    expect(isProtectedDemoAccount(" Admin@Creditly.test ")).toBe(true);
    expect(isProtectedDemoAccount(DEMO_ACCOUNTS.customer)).toBe(true);
    expect(isProtectedDemoAccount("ben@demo.creditly.test")).toBe(false);
  });

  it("issues no reset token or email for a demo account", async () => {
    demoOn();
    await makeUser({ email: DEMO_ACCOUNTS.customer });
    expect(await requestPasswordReset(db, DEMO_ACCOUNTS.customer, "http://app")).toBeNull();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("rejects a reset token issued before demo mode was switched on", async () => {
    const ava = await makeUser({ email: DEMO_ACCOUNTS.customer });
    const token = (await requestPasswordReset(db, ava.email, "http://app"))!;
    demoOn();
    await expect(resetPassword(db, token, "hijacked-pass")).rejects.toMatchObject({ code: "FORBIDDEN" });
    const after = await db.query.users.findFirst({ where: eq(users.id, ava.id) });
    expect(await verifyPassword("password123", after!.passwordHash!)).toBe(true);
  });

  it("masks emails typed by visitors, keeps seeded ones", () => {
    expect(displayEmail("jane.doe@gmail.com")).toBe("jane.doe@gmail.com");
    demoOn();
    expect(displayEmail("jane.doe@gmail.com")).toBe("j***@g***.com");
    expect(displayEmail("ava@demo.creditly.test")).toBe("ava@demo.creditly.test");
    expect(displayEmail(DEMO_ACCOUNTS.admin)).toBe(DEMO_ACCOUNTS.admin);
  });
});
