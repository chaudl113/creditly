"use client";

import { Loader2Icon, PlusIcon, Undo2Icon } from "lucide-react";
import { useActionState, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Notice } from "@/components/notice";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { adjustCreditsAction, refundAction, type AdminActionState } from "./actions";

/** Dialog + form whose requestId is minted per opening, so a double submit posts once. */
function ActionDialog({
  trigger,
  title,
  description,
  action,
  submitLabel,
  children,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  action: (prev: AdminActionState, form: FormData) => Promise<AdminActionState>;
  submitLabel: string;
  children: (values: Record<string, string>) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [requestId, setRequestId] = useState("");
  const [state, formAction, pending] = useActionState(action, undefined);
  const [handled, setHandled] = useState<number | undefined>();

  if (state?.at && state.at !== handled) {
    setHandled(state.at);
    if (state.ok) setOpen(false);
  }
  useEffect(() => {
    if (state?.ok) toast.success(state.ok);
  }, [state]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setRequestId(crypto.randomUUID());
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form action={formAction}>
          <input type="hidden" name="requestId" value={requestId} />
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <FieldGroup className="py-4">
            {state?.error && state.at === handled && <Notice tone="error">{state.error}</Notice>}
            {children(state?.values ?? {})}
          </FieldGroup>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending} data-testid="admin-dialog-submit">
              {pending && <Loader2Icon className="animate-spin" />}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReasonField({ placeholder, defaultValue }: { placeholder: string; defaultValue?: string }) {
  return (
    <Field>
      <FieldLabel htmlFor="admin-reason">Reason</FieldLabel>
      <Textarea
        id="admin-reason"
        name="reason"
        required
        minLength={3}
        maxLength={500}
        placeholder={placeholder}
        defaultValue={defaultValue}
      />
      <FieldDescription>Stored in the audit log with your account.</FieldDescription>
    </Field>
  );
}

export function AdjustCreditsDialog({ userId, email }: { userId: string; email: string }) {
  return (
    <ActionDialog
      trigger={
        <Button variant="outline" size="sm" data-testid="adjust-credits">
          <PlusIcon /> Adjust credits
        </Button>
      }
      title="Adjust credits"
      description={`Post a manual ledger adjustment for ${email}. Debits cannot take the balance below zero.`}
      action={adjustCreditsAction}
      submitLabel="Post adjustment"
    >
      {(v) => (
        <>
          <input type="hidden" name="userId" value={userId} />
          <div className="grid grid-cols-[8rem_1fr] gap-3">
            <Field>
              <FieldLabel htmlFor="admin-direction">Direction</FieldLabel>
              <Select name="direction" defaultValue={v.direction ?? "credit"}>
                <SelectTrigger id="admin-direction" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="credit">Add</SelectItem>
                  <SelectItem value="debit">Remove</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="admin-delta">Credits</FieldLabel>
              <Input
                id="admin-delta"
                name="delta"
                type="number"
                min={1}
                max={100000}
                step={1}
                defaultValue={v.delta}
                required
              />
            </Field>
          </div>
          <ReasonField placeholder="e.g. Compensation for the outage on Oct 3" defaultValue={v.reason} />
        </>
      )}
    </ActionDialog>
  );
}

export function RefundDialog({
  paymentId,
  refundableCents,
  label,
}: {
  paymentId: string;
  refundableCents: number;
  label: string;
}) {
  const max = (refundableCents / 100).toFixed(2);
  return (
    <ActionDialog
      trigger={
        <Button variant="ghost" size="sm" disabled={refundableCents <= 0} data-testid="refund-payment">
          <Undo2Icon /> Refund
        </Button>
      }
      title="Refund payment"
      description={`${label}. Refunds go through Stripe; a matching share of the credits it granted is reclaimed (never more than the user still has).`}
      action={refundAction}
      submitLabel="Refund"
    >
      {(v) => (
        <>
          <input type="hidden" name="paymentId" value={paymentId} />
          <Field>
            <FieldLabel htmlFor="admin-amount">Amount (USD)</FieldLabel>
            <Input
              id="admin-amount"
              name="amount"
              type="number"
              min={0.01}
              max={max}
              step={0.01}
              defaultValue={v.amount ?? max}
              required
            />
            <FieldDescription>Up to ${max} is still refundable.</FieldDescription>
          </Field>
          <ReasonField placeholder="e.g. Customer was charged twice" defaultValue={v.reason} />
        </>
      )}
    </ActionDialog>
  );
}
