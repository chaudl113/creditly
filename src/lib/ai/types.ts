import { z } from "zod";

export const SummarySchema = z.object({
  title: z.string().describe("A short title for the document"),
  summary: z.string().describe("3-5 sentence summary in plain English"),
  key_points: z.array(z.string()).describe("The most important points, one sentence each"),
  table: z
    .object({
      columns: z.array(z.string()),
      rows: z.array(z.array(z.string())),
    })
    .describe("Facts, figures, names and dates found in the text, as a table"),
});
export type Summary = z.infer<typeof SummarySchema>;

export type ProviderResult = {
  output: Summary;
  inputTokens: number;
  outputTokens: number;
  model: string;
};

export interface SummaryProvider {
  readonly name: "anthropic" | "demo";
  summarize(text: string): Promise<ProviderResult>;
}

/** Expected provider failure (refusal, malformed output, upstream error). */
export class ProviderError extends Error {
  name = "ProviderError";
}
