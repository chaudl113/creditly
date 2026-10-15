import type { ReactNode } from "react";
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export function StatCard({
  label,
  value,
  footer,
  action,
  testId,
}: {
  label: string;
  value: ReactNode;
  footer?: ReactNode;
  action?: ReactNode;
  testId?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl font-semibold tabular-nums" data-testid={testId}>
          {value}
        </CardTitle>
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      {footer && <CardFooter className="text-sm text-muted-foreground">{footer}</CardFooter>}
    </Card>
  );
}
