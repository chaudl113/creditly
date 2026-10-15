import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** shadcn Badge with semantic tones for statuses (success / warning / danger). */
const TONES = {
  success: "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  warning: "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400",
  danger: "border-transparent bg-destructive/15 text-destructive",
  neutral: "",
};

const BY_STATUS: Record<string, keyof typeof TONES> = {
  active: "success",
  trialing: "success",
  succeeded: "success",
  processed: "success",
  completed: "success",
  past_due: "warning",
  running: "warning",
  pending: "warning",
  ignored: "neutral",
  canceled: "neutral",
  failed: "danger",
};

export function StatusBadge({ status, label, tone }: { status: string; label?: string; tone?: keyof typeof TONES }) {
  const t = tone ?? BY_STATUS[status] ?? "neutral";
  return (
    <Badge variant={t === "neutral" ? "secondary" : "outline"} className={cn(TONES[t])}>
      {label ?? status.replaceAll("_", " ")}
    </Badge>
  );
}
