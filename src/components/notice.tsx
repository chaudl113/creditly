import { CircleAlertIcon, CircleCheckIcon, InfoIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";

/** shadcn Alert with an icon per tone; only errors are announced assertively. */
export function Notice({ tone, children }: { tone: "error" | "success" | "info"; children: ReactNode }) {
  const Icon = tone === "error" ? CircleAlertIcon : tone === "success" ? CircleCheckIcon : InfoIcon;
  return (
    <Alert variant={tone === "error" ? "destructive" : "default"} role={tone === "error" ? "alert" : "status"}>
      <Icon />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
