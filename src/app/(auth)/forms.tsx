"use client";

import { Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useActionState, type ComponentProps, type ReactNode } from "react";
import { Notice } from "@/components/notice";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  forgotPasswordAction,
  loginAction,
  resetPasswordAction,
  signupAction,
  type FormState,
} from "./actions";

function Shell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
      {footer && <CardFooter className="justify-center text-sm text-muted-foreground">{footer}</CardFooter>}
    </Card>
  );
}

function Status({ state }: { state: FormState }) {
  if (state?.error) return <Notice tone="error">{state.error}</Notice>;
  if (state?.ok) return <Notice tone="success">{state.ok}</Notice>;
  return null;
}

function TextField({ label, hint, name, ...props }: ComponentProps<typeof Input> & { label: string; name: string; hint?: string }) {
  const id = `field-${name}`;
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} name={name} {...props} />
      {hint && <FieldDescription>{hint}</FieldDescription>}
    </Field>
  );
}

function Submit({ pending, label, pendingLabel }: { pending: boolean; label: string; pendingLabel: string }) {
  return (
    <Button type="submit" size="lg" disabled={pending} className="w-full">
      {pending && <Loader2Icon className="animate-spin" />}
      {pending ? pendingLabel : label}
    </Button>
  );
}

const linkClass = "font-medium text-primary underline-offset-4 hover:underline";

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
      description="Welcome back to Creditly."
      footer={<span>New here? <Link href="/signup" className={linkClass}>Create an account</Link></span>}
    >
      {notice && <Notice tone="success">{notice}</Notice>}
      <Status state={state} />
      <form action={action}>
        <input type="hidden" name="next" value={next ?? ""} />
        <FieldGroup>
          <TextField label="Email" name="email" type="email" autoComplete="email" required />
          <Field>
            <div className="flex items-center justify-between">
              <FieldLabel htmlFor="field-password">Password</FieldLabel>
              <Link href="/forgot-password" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
                Forgot password?
              </Link>
            </div>
            <Input id="field-password" name="password" type="password" autoComplete="current-password" required />
          </Field>
          <Submit pending={pending} label="Log in" pendingLabel="Signing in…" />
        </FieldGroup>
      </form>
      {googleEnabled && (
        <>
          <FieldSeparator>or</FieldSeparator>
          <form action={googleAction}>
            <Button type="submit" variant="outline" size="lg" className="w-full">Continue with Google</Button>
          </form>
        </>
      )}
    </Shell>
  );
}

export function SignupForm() {
  const [state, action, pending] = useActionState(signupAction, undefined);
  return (
    <Shell
      title="Create your account"
      description="The Free plan includes 50 credits. No card required."
      footer={<span>Already have an account? <Link href="/login" className={linkClass}>Log in</Link></span>}
    >
      <Status state={state} />
      <form action={action}>
        <FieldGroup>
          <TextField label="Name" name="name" autoComplete="name" required />
          <TextField label="Email" name="email" type="email" autoComplete="email" required />
          <TextField label="Password" name="password" type="password" autoComplete="new-password" minLength={8} hint="At least 8 characters." required />
          <Submit pending={pending} label="Create account" pendingLabel="Creating account…" />
        </FieldGroup>
      </form>
    </Shell>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(forgotPasswordAction, undefined);
  return (
    <Shell
      title="Reset your password"
      description="We will email you a link that is valid for one hour."
      footer={<Link href="/login" className={linkClass}>Back to log in</Link>}
    >
      <Status state={state} />
      <form action={action}>
        <FieldGroup>
          <TextField label="Email" name="email" type="email" autoComplete="email" required />
          <Submit pending={pending} label="Send reset link" pendingLabel="Sending…" />
        </FieldGroup>
      </form>
    </Shell>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, undefined);
  return (
    <Shell title="Choose a new password">
      <Status state={state} />
      <form action={action}>
        <input type="hidden" name="token" value={token} />
        <FieldGroup>
          <TextField label="New password" name="password" type="password" autoComplete="new-password" minLength={8} required />
          <Submit pending={pending} label="Save password" pendingLabel="Saving…" />
        </FieldGroup>
      </form>
    </Shell>
  );
}
