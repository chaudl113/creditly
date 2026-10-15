import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Creditly — AI summaries on a credit balance", template: "%s · Creditly" },
  description: "Subscription + credit-based AI SaaS starter: Stripe billing, double-entry credit ledger, admin dashboard.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
