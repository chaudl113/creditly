import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import type { Provider } from "next-auth/providers";
import { z } from "zod";
import { getDb } from "@/db";
import { verifyPassword } from "@/lib/auth/password";
import { DEMO_ACCOUNTS, isDemoPublic } from "@/lib/demo";
import { AUTH_LIMITS, clientIp, hit, type Limit } from "@/lib/rate-limit";
import { createUser, findUserByEmail } from "@/lib/users";

declare module "next-auth" {
  interface Session {
    authTime: number;
    user: { id: string; email: string; name: string };
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    uid?: string;
    authTime?: number;
  }
}

const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

/** Thrown when an IP exceeds its auth limit; `code` reaches the login form. */
export class RateLimited extends CredentialsSignin {
  code = "rate_limited";
}

/** Per-IP limits apply in public demo mode only. */
async function enforceLimit(name: keyof typeof AUTH_LIMITS, request: Request) {
  if (!isDemoPublic()) return;
  const limit: Limit = AUTH_LIMITS[name];
  if (!(await hit(getDb(), `${name}:${clientIp(request.headers)}`, limit))) throw new RateLimited();
}

const providers: Provider[] = [
  Credentials({
    credentials: { email: {}, password: {} },
    async authorize(raw, request) {
      await enforceLimit("login", request);
      const parsed = credentialsSchema.safeParse(raw);
      if (!parsed.success) throw new CredentialsSignin();
      const user = await findUserByEmail(getDb(), parsed.data.email);
      if (!user?.passwordHash || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
        throw new CredentialsSignin();
      }
      return { id: user.id, email: user.email, name: user.name };
    },
  }),
];

if (isDemoPublic()) {
  // One-click sign-in for the shared demo accounts; no password leaves the server.
  providers.push(
    Credentials({
      id: "demo",
      name: "Demo",
      credentials: { role: {} },
      async authorize(raw, request) {
        await enforceLimit("demoLogin", request);
        const role = z.enum(["customer", "admin"]).safeParse(raw.role);
        if (!role.success) throw new CredentialsSignin();
        const user = await findUserByEmail(getDb(), DEMO_ACCOUNTS[role.data]);
        if (!user) throw new CredentialsSignin();
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  );
}

export const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
if (googleEnabled) providers.push(Google);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  trustHost: true,
  pages: { signIn: "/login" },
  logger: {
    // A wrong password is an expected outcome, not a server error.
    error(error) {
      if (error.name !== "CredentialsSignin") console.error(error);
    },
  },
  callbacks: {
    async jwt({ token, user, account }) {
      if (user && account) {
        // First request after sign-in: pin our own user id into the token.
        if (account.type === "credentials") {
          token.uid = user.id;
        } else if (user.email) {
          const db = getDb();
          const existing =
            (await findUserByEmail(db, user.email)) ??
            (await createUser(db, { email: user.email, name: user.name ?? user.email }));
          token.uid = existing.id;
        }
        token.authTime = Date.now();
      }
      return token;
    },
    session({ session, token }) {
      // Role is NOT read from the token: the DAL loads it fresh from the DB.
      session.user.id = token.uid ?? "";
      session.authTime = token.authTime ?? 0;
      return session;
    },
  },
});
