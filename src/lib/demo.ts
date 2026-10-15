/**
 * Public demo mode (`DEMO_PUBLIC=1`): the app runs on the open internet with
 * shared accounts. It turns off URL fetching, adds one-click demo sign-in,
 * freezes the demo accounts' credentials and rate-limits auth by IP.
 */
export const isDemoPublic = () => process.env.DEMO_PUBLIC === "1";

export const DEMO_DOMAIN = "demo.creditly.test";
export const ADMIN_EMAIL = "admin@creditly.test";

/** Accounts behind the "Try as …" buttons. */
export const DEMO_ACCOUNTS = {
  customer: `ava@${DEMO_DOMAIN}`,
  admin: ADMIN_EMAIL,
} as const;
export type DemoRole = keyof typeof DEMO_ACCOUNTS;

/** Shared accounts whose password or email must not change in public demo mode. */
export function isProtectedDemoAccount(email: string): boolean {
  if (!isDemoPublic()) return false;
  const e = email.trim().toLowerCase();
  return Object.values(DEMO_ACCOUNTS).some((a) => a === e);
}

/** Seeded addresses are safe to show; anything a visitor typed is masked for other visitors. */
export function displayEmail(email: string): string {
  if (!isDemoPublic() || email.endsWith(`@${DEMO_DOMAIN}`) || email === ADMIN_EMAIL) return email;
  const [local, domain = ""] = email.split("@");
  return `${local.slice(0, 1)}***@${domain.replace(/^[^.]*/, (d) => d.slice(0, 1) + "***")}`;
}
