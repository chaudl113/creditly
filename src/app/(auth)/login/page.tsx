import { redirect } from "next/navigation";
import { googleEnabled, signIn } from "@/auth";
import { getCurrentUser } from "@/lib/auth/session";
import { isDemoPublic } from "@/lib/demo";
import { LoginForm } from "../forms";

export const metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/app");
  const { next, reset } = await searchParams;
  async function googleAction() {
    "use server";
    await signIn("google", { redirectTo: "/app" });
  }
  return (
    <LoginForm
      next={typeof next === "string" ? next : undefined}
      notice={reset ? "Password updated. Log in with your new password." : undefined}
      demo={isDemoPublic()}
      googleEnabled={googleEnabled}
      googleAction={googleAction}
    />
  );
}
