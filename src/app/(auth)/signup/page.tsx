import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { isDemoPublic } from "@/lib/demo";
import { SignupForm } from "../forms";

export const metadata = { title: "Sign up" };

export default async function SignupPage() {
  if (await getCurrentUser()) redirect("/app");
  return <SignupForm demo={isDemoPublic()} />;
}
