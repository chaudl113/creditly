import { ResetPasswordForm } from "../../forms";

export const metadata = { title: "Reset password" };

export default async function ResetPasswordPage({ params }: PageProps<"/reset-password/[token]">) {
  const { token } = await params;
  return <ResetPasswordForm token={token} />;
}
