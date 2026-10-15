"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

const config = {
  net: { label: "Net revenue", color: "var(--chart-1)" },
} satisfies ChartConfig;

const usd = (v: number) => `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export function RevenueChart({ data }: { data: { day: string; netCents: number }[] }) {
  const rows = data.map((d) => ({ day: d.day, net: d.netCents / 100 }));
  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      <BarChart data={rows} margin={{ left: 4, right: 4 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="day"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          tickFormatter={(v: string) => new Date(`${v}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
        />
        <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={usd} />
        <ChartTooltip
          content={<ChartTooltipContent formatter={(v) => `Net ${usd(Number(v))}`} labelFormatter={(l) => String(l)} />}
        />
        <Bar dataKey="net" fill="var(--color-net)" radius={4} isAnimationActive={false} />
      </BarChart>
    </ChartContainer>
  );
}
