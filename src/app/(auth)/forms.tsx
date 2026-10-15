"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert, Button, Card, Field } from "@/components/ui";
import {
  forgotPasswordAction,
  loginAction,
  resetPasswordAction,
  signupAction,
  type FormState,
} from "./actions";

function Shell({ title, children, footer }: { title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <Card className="space-y-5">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      {children}
      {footer && <div className="border-t border-slate-100 pt-4 text-sm text-slate-600">{footer}</div>}
    </Card>
  );
}

function Status({ state }: { state: FormState }) {
  if (state?.error) return <Alert tone="error">{state.error}</Alert>;
  if (state?.ok) return <Alert tone="success">{state.ok}</Alert>;
  return null;
}

export function LoginForm({ next, notice, googleEnabled, googleAction }: {
  next?: string;
  notice?: string;
  googleEnabled: boolean;
  googleAction: () => Promise<void>;
}) {
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <Shell
      title="Log in"
      footer={
        <>
          New here? <Link href="/signup" className="font-medium text-brand-600">Create an account</Link>
        </>
      }
    >
      {notice && <Alert tone="success">{notice}</Alert>}
      <Status state={state} />
      <form action={action} className="space-y-4">
        <input type="hidden" name="next" value={next ?? ""} />
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Field label="Password" name="password" type="password" autoComplete="current-password" required />
        <div className="flex items-center justify-between">
          <Link href="/forgot-password" className="text-sm text-brand-600">Forgot password?</Link>
          <Button type="submit" disabled={pending}>{pending ? "Signing in…" : "Log in"}</Button>
        </div>
      </form>
      {googleEnabled && (
        <form action={googleAction}>
          <Button type="submit" variant="secondary" className="w-full">Continue with Google</Button>
        </form>
      )}
    </Shell>
  );
}

export function SignupForm() {
  const [state, action, pending] = useActionState(signupAction, undefined);
  return (
    <Shell
      title="Create your account"
      footer={
        <>
          Already have an account? <Link href="/login" className="font-medium text-brand-600">Log in</Link>
        </>
      }
    >
      <p className="text-sm text-slate-600">Free plan includes 50 credits. No card required.</p>
      <Status state={state} />
      <form action={action} className="space-y-4">
        <Field label="Name" name="name" autoComplete="name" required />
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Field label="Password" name="password" type="password" autoComplete="new-password" minLength={8} hint="At least 8 characters" required />
        <Button type="submit" disabled={pending} className="w-full">{pending ? "Creating account…" : "Create account"}</Button>
      </form>
    </Shell>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(forgotPasswordAction, undefined);
  return (
    <Shell title="Reset your password" footer={<Link href="/login" className="text-brand-600">Back to log in</Link>}>
      <p className="text-sm text-slate-600">We will email you a link that is valid for one hour.</p>
      <Status state={state} />
      <form action={action} className="space-y-4">
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Button type="submit" disabled={pending} className="w-full">{pending ? "Sending…" : "Send reset link"}</Button>
      </form>
    </Shell>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, undefined);
  return (
    <Shell title="Choose a new password">
      <Status state={state} />
      <form action={action} className="space-y-4">
        <input type="hidden" name="token" value={token} />
        <Field label="New password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        <Button type="submit" disabled={pending} className="w-full">{pending ? "Saving…" : "Save password"}</Button>
      </form>
    </Shell>
  );
}
