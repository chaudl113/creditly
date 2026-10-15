import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { users } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createUser, requestPasswordReset, resetPassword } from "@/lib/users";
import { makeUser, resetDb, testDb } from "./helpers";

vi.mock("@/lib/mail", () => ({ sendMail: vi.fn(async () => {}) }));

const db = testDb();
beforeEach(() => resetDb());

describe("passwords", () => {
  it("hashes with a random salt and verifies", async () => {
    const a = await hashPassword("correct horse");
    const b = await hashPassword("correct horse");
    expect(a).not.toBe(b);
    expect(await verifyPassword("correct horse", a)).toBe(true);
    expect(await verifyPassword("wrong horse", a)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });
});

describe("accounts", () => {
  it("rejects a duplicate email regardless of case", async () => {
    await createUser(db, { email: "Ann@Example.com", name: "Ann", password: "password123" });
    await expect(
      createUser(db, { email: "ann@example.COM", name: "Ann 2", password: "password123" }),
    ).rejects.toMatchObject({ code: "EMAIL_TAKEN" });
  });
});

describe("password reset", () => {
  it("does not reveal whether an email exists", async () => {
    expect(await requestPasswordReset(db, "nobody@test.local", "http://app")).toBeNull();
  });

  it("resets once, then the token is dead", async () => {
    const user = await makeUser();
    const token = (await requestPasswordReset(db, user.email, "http://app"))!;
    await resetPassword(db, token, "new-password-1");
    const updated = await db.query.users.findFirst({ where: eq(users.id, user.id) });
    expect(await verifyPassword("new-password-1", updated!.passwordHash!)).toBe(true);
    expect(updated!.passwordChangedAt).toBeInstanceOf(Date);
    await expect(resetPassword(db, token, "another-pass-2")).rejects.toMatchObject({ code: "INVALID_TOKEN" });
  });

  it("rejects an expired token", async () => {
    const user = await makeUser();
    const issuedAt = new Date("2026-01-01T10:00:00Z");
    const token = (await requestPasswordReset(db, user.email, "http://app", issuedAt))!;
    const later = new Date(issuedAt.getTime() + 61 * 60 * 1000);
    await expect(resetPassword(db, token, "new-password-1", later)).rejects.toMatchObject({ code: "INVALID_TOKEN" });
  });

  it("rejects a forged token", async () => {
    await expect(resetPassword(db, "not-a-real-token", "new-password-1")).rejects.toMatchObject({
      code: "INVALID_TOKEN",
    });
  });
});
