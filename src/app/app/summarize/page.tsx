import { and, eq } from "drizzle-orm";
import { CircleAlertIcon } from "lucide-react";
import Link from "next/link";
import { formatDate } from "@/components/statement";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/db";
import { aiJobs, type AiJob } from "@/db/schema";
import { defaultProvider, recentJobs } from "@/lib/ai/jobs";
import { MAX_INPUT_CHARS } from "@/lib/ai/pricing";
import type { Summary } from "@/lib/ai/types";
import { requireUser } from "@/lib/auth/session";
import { getUserBalance } from "@/lib/ledger";
import { SummarizeForm } from "./summarize-form";

export const metadata = { title: "Summarize" };

function JobResult({ job }: { job: AiJob }) {
  if (job.status === "failed") {
    return (
      <Card className="border-destructive/40" data-testid="job-result">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CircleAlertIcon className="size-4 text-destructive" /> The run failed
          </CardTitle>
          <CardDescription>{job.error}</CardDescription>
          <CardAction><StatusBadge status="failed" /></CardAction>
        </CardHeader>
        <CardContent className="text-sm" data-testid="job-refund">
          All {job.creditsReserved} reserved credits were returned to your balance.
        </CardContent>
      </Card>
    );
  }
  if (job.status === "running" || !job.result) {
    return (
      <Card data-testid="job-result">
        <CardHeader>
          <CardTitle>Still running…</CardTitle>
          <CardDescription>Refresh in a moment.</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  const result = job.result as Summary & { truncated?: boolean };
  return (
    <Card data-testid="job-result">
      <CardHeader>
        <CardTitle className="text-lg">{result.title}</CardTitle>
        <CardDescription>
          {job.provider === "demo" ? "Demo provider" : job.model} · {job.inputTokens?.toLocaleString("en-US")} in /{" "}
          {job.outputTokens?.toLocaleString("en-US")} out tokens ·{" "}
          <span data-testid="credits-charged">{job.creditsCharged} credits</span> charged ({job.creditsReserved}{" "}
          reserved)
          {result.truncated && " · input truncated"}
        </CardDescription>
        <CardAction><StatusBadge status="succeeded" /></CardAction>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="leading-relaxed">{result.summary}</p>
        {result.key_points.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-medium">Key points</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {result.key_points.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          </div>
        )}
        {result.table.rows.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-medium">Extracted data</h3>
            <div className="rounded-lg border">
              <Table data-testid="extracted-table">
                <TableHeader>
                  <TableRow>
                    {result.table.columns.map((c) => <TableHead key={c}>{c}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.table.rows.map((row, i) => (
                    <TableRow key={i}>
                      {row.map((cell, j) => <TableCell key={j} className="whitespace-normal">{cell}</TableCell>)}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default async function SummarizePage({ searchParams }: PageProps<"/app/summarize">) {
  const user = await requireUser();
  const db = getDb();
  const { job: jobId } = await searchParams;
  const validId = typeof jobId === "string" && /^[0-9a-f-]{36}$/i.test(jobId);
  const [balance, jobs, [job]] = await Promise.all([
    getUserBalance(db, user.id),
    recentJobs(db, user.id, 10),
    validId
      ? db.select().from(aiJobs).where(and(eq(aiJobs.id, jobId), eq(aiJobs.userId, user.id)))
      : Promise.resolve([] as AiJob[]),
  ]);
  const demo = defaultProvider().name === "demo";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Summarize & extract</h1>
          {demo && <Badge variant="secondary" data-testid="demo-mode">Demo mode</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">
          Balance: <span className="font-medium text-foreground tabular-nums" data-testid="credit-balance">{balance.toLocaleString("en-US")}</span> credits
        </p>
      </div>
      {demo && (
        <p className="text-sm text-muted-foreground">
          No <code className="font-mono">ANTHROPIC_API_KEY</code> is set, so an offline extractive summarizer is
          used. Credit accounting works exactly the same.
        </p>
      )}
      <Card>
        <CardContent>
          <SummarizeForm maxChars={MAX_INPUT_CHARS} demo={demo} />
        </CardContent>
      </Card>
      {job && <JobResult job={job} />}
      <Card>
        <CardHeader>
          <CardTitle>Recent runs</CardTitle>
          <CardDescription>Limited to 5 runs per minute. Failed runs are refunded in full.</CardDescription>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Credits</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((j) => (
                  <TableRow key={j.id}>
                    <TableCell className="text-muted-foreground">
                      <Link href={`/app/summarize?job=${j.id}`} className="hover:underline">{formatDate(j.createdAt)}</Link>
                    </TableCell>
                    <TableCell className="max-w-[16rem] truncate">
                      {j.source === "url" ? j.sourceUrl : `Text · ${j.inputChars.toLocaleString("en-US")} chars`}
                    </TableCell>
                    <TableCell><StatusBadge status={j.status} /></TableCell>
                    <TableCell className="text-right tabular-nums">
                      {j.status === "failed" ? (
                        <span className="text-muted-foreground">0 (refunded)</span>
                      ) : j.status === "running" ? (
                        `${j.creditsReserved} held`
                      ) : (
                        j.creditsCharged
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
