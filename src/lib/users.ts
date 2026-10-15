import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { Db, DbOrTx } from "@/db";
import { passwordResetTokens, users, type User } from "@/db/schema";
import { grantSignupCredits } from "./credits";
import { AppError } from "./errors";
import { ensureUserAccount } from "./ledger";
import { hashPassword } from "./auth/password";
import { sendMail } from "./mail";

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export async function findUserByEmail(db: Db, email: string): Promise<User | undefined> {
  return db.query.users.findFirst({ where: eq(users.email, normalizeEmail(email)) });
}

export async function findUserById(db: Db, id: string): Promise<User | undefined> {
  return db.query.users.findFirst({ where: eq(users.id, id) });
}

export async function createUser(
  db: DbOrTx,
  input: { email: string; name: string; password?: string; role?: User["role"] },
): Promise<User> {
  const email = normalizeEmail(input.email);
  const passwordHash = input.password ? await hashPassword(input.password) : null;
  return db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ email, name: input.name.trim(), passwordHash, role: input.role ?? "user" })
      .onConflictDoNothing({ target: users.email })
      .returning();
    if (!user) throw new AppError("EMAIL_TAKEN", "An account with this email already exists.");
    // Wallet + welcome credits are created in the same transaction as the user.
    await ensureUserAccount(tx, user.id);
    await grantSignupCredits(tx, user.id);
    return user;
  });
}

const RESET_TTL_MS = 60 * 60 * 1000;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/**
 * Always resolves the same way whether or not the email exists, so the form
 * cannot be used to enumerate accounts. Returns the raw token for tests.
 */
export async function requestPasswordReset(
  db: Db,
  email: string,
  appUrl: string,
  now = new Date(),
): Promise<string | null> {
  const user = await findUserByEmail(db, email);
  if (!user) return null;
  const token = randomBytes(32).toString("base64url");
  await db.insert(passwordResetTokens).values({
    userId: user.id,
    tokenHash: sha256(token),
    expiresAt: new Date(now.getTime() + RESET_TTL_MS),
  });
  await sendMail({
    to: user.email,
    subject: "Reset your Creditly password",
    text: `Hi ${user.name},\n\nReset your password (valid for 1 hour):\n${appUrl}/reset-password/${token}\n\nIf you did not ask for this, ignore this email.`,
  });
  return token;
}

export async function resetPassword(
  db: Db,
  token: string,
  newPassword: string,
  now = new Date(),
): Promise<void> {
  const passwordHash = await hashPassword(newPassword);
  await db.transaction(async (tx) => {
    // Claim the token atomically: a second use (or a race) updates zero rows.
    const [claimed] = await tx
      .update(passwordResetTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(passwordResetTokens.tokenHash, sha256(token)),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, now),
        ),
      )
      .returning();
    if (!claimed) throw new AppError("INVALID_TOKEN", "This reset link is invalid or has expired.");
    await tx
      .update(users)
      .set({ passwordHash, passwordChangedAt: now })
      .where(eq(users.id, claimed.userId));
  });
}
