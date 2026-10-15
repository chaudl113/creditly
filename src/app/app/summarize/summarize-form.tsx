"use client";

import { FileTextIcon, LinkIcon, Loader2Icon, SparklesIcon } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Notice } from "@/components/notice";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { summarizeAction } from "./actions";

const SAMPLE = `Northwind Analytics reported third-quarter revenue of $48.2 million on October 14, up 23% from a year earlier. \
Subscription revenue made up $41.7 million, while services contributed $6.5 million. The company ended the quarter with \
1,240 enterprise customers, compared with 980 a year ago, and net revenue retention of 118%. Operating margin improved to \
12% from 7%. Chief executive Dana Whitfield said the new forecasting product, launched on July 2, signed 85 customers in \
its first quarter. Northwind raised its full-year revenue guidance to between $186 million and $190 million and expects \
to open an office in Singapore in March 2027. Headcount rose to 640 employees.`;

export function SummarizeForm({ maxChars, demo }: { maxChars: number; demo: boolean }) {
  const [state, action, pending] = useActionState(summarizeAction, undefined);
  const [kind, setKind] = useState<"text" | "url">("text");
  const [text, setText] = useState("");

  useEffect(() => {
    if (state?.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={action}>
      <input type="hidden" name="kind" value={kind} />
      <FieldGroup>
        {state?.error && (
          <Notice tone="error">
            {state.error}
            {state.code === "INSUFFICIENT_CREDITS" && (
              <>
                {" "}
                <Link href="/app/billing" className="font-medium underline underline-offset-4">Buy credits</Link>
              </>
            )}
          </Notice>
        )}
        <Tabs value={kind} onValueChange={(v) => setKind(v as "text" | "url")}>
          <TabsList>
            <TabsTrigger value="text"><FileTextIcon /> Text</TabsTrigger>
            <TabsTrigger value="url"><LinkIcon /> URL</TabsTrigger>
          </TabsList>
          <TabsContent value="text" className="pt-2">
            <Field>
              <div className="flex items-center justify-between">
                <FieldLabel htmlFor="sum-text">Text to summarize</FieldLabel>
                <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => setText(SAMPLE)}>
                  Use sample text
                </Button>
              </div>
              <Textarea
                id="sum-text"
                name="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={10}
                maxLength={maxChars}
                placeholder="Paste an article, report, meeting notes…"
                className="max-h-96 min-h-48"
              />
              <FieldDescription>
                {text.length.toLocaleString("en-US")} / {maxChars.toLocaleString("en-US")} characters
                {demo && " · Demo mode: include [fail] to simulate a provider error and see the automatic refund."}
              </FieldDescription>
            </Field>
          </TabsContent>
          <TabsContent value="url" className="pt-2">
            <Field>
              <FieldLabel htmlFor="sum-url">Public web page</FieldLabel>
              <Input id="sum-url" name="url" type="url" placeholder="https://example.com/article" />
              <FieldDescription>
                Only public http(s) pages are fetched; private network addresses are blocked. Long pages are truncated.
              </FieldDescription>
            </Field>
          </TabsContent>
        </Tabs>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="lg" disabled={pending} data-testid="summarize-submit">
            {pending ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
            {pending ? "Summarizing…" : "Summarize"}
          </Button>
          <span className="text-sm text-muted-foreground">
            Credits are reserved up front and the unused part is returned when the run finishes.
          </span>
        </div>
      </FieldGroup>
    </form>
  );
}
