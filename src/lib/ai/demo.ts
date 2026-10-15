import { ProviderError, type ProviderResult, type Summary, type SummaryProvider } from "./types";

/**
 * Deterministic, offline stand-in used when ANTHROPIC_API_KEY is not set.
 * It is clearly labelled "demo mode" in the UI. It extracts sentences and
 * facts with simple heuristics so the whole billing flow can be exercised.
 * Include the marker "[fail]" in the input to simulate a provider error.
 */
export const DEMO_FAILURE_MARKER = "[fail]";

const STOP = new Set(
  "the a an and or of to in on for with is are was were be been by as at it this that from has have had not but its their our your will can".split(" "),
);

function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);
}

function rankSentences(all: string[]): { s: string; i: number; score: number }[] {
  const freq = new Map<string, number>();
  for (const w of all.join(" ").toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? []) {
    if (!STOP.has(w)) freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  const score = (s: string) => {
    const words = s.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? [];
    return words.reduce((acc, w) => acc + (freq.get(w) ?? 0), 0) / Math.max(4, words.length);
  };
  return all
    .map((s, i) => ({ s, i, score: score(s) + (i === 0 ? 1 : 0) }))
    .sort((a, b) => b.score - a.score);
}

const FACT_PATTERNS: { label: string; re: RegExp }[] = [
  { label: "Amount", re: /(?:[$€£]\s?\d[\d,]*(?:\.\d+)?\s?(?:million|billion|k|m|bn)?|\d[\d,]*(?:\.\d+)?\s?(?:USD|EUR|dollars))/gi },
  { label: "Percentage", re: /\d+(?:\.\d+)?\s?%/g },
  {
    label: "Date",
    re: /\b(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:,\s*\d{4})?|\d{4}-\d{2}-\d{2}|Q[1-4]\s+\d{4})\b/g,
  },
];

function extractTable(text: string, sents: string[]): Summary["table"] {
  const rows: string[][] = [];
  const seen = new Set<string>();
  for (const line of text.split(/\n/)) {
    const m = line.match(/^\s*[-*•]?\s*([A-Z][\w ()/&-]{1,40}):\s+(.{1,120})$/);
    if (m && !seen.has(m[1])) {
      seen.add(m[1]);
      rows.push(["Field", m[1].trim(), m[2].trim()]);
    }
  }
  for (const { label, re } of FACT_PATTERNS) {
    for (const s of sents) {
      for (const hit of s.match(re) ?? []) {
        const key = `${label}:${hit}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push([label, hit.trim(), s.length > 110 ? s.slice(0, 107) + "…" : s]);
      }
    }
  }
  return { columns: ["Type", "Value", "Context"], rows: rows.slice(0, 15) };
}

export class DemoProvider implements SummaryProvider {
  readonly name = "demo" as const;

  async summarize(text: string): Promise<ProviderResult> {
    if (text.includes(DEMO_FAILURE_MARKER)) {
      throw new ProviderError(`Demo provider failure (triggered by "${DEMO_FAILURE_MARKER}" in the input)`);
    }
    const sents = sentences(text);
    if (sents.length === 0) throw new ProviderError("Not enough text to summarise");
    const ranked = rankSentences(sents);
    const top = ranked.slice(0, Math.min(3, ranked.length)).sort((a, b) => a.i - b.i).map((r) => r.s);
    const points = ranked.slice(0, Math.min(5, ranked.length)).map((r) => r.s);
    const firstLine = text.trim().split("\n")[0].trim();
    const output: Summary = {
      title: firstLine.length <= 80 ? firstLine : firstLine.slice(0, 77) + "…",
      summary: top.join(" "),
      key_points: points,
      table: extractTable(text, sents),
    };
    return {
      output,
      inputTokens: Math.ceil(text.length / 4) + 400,
      outputTokens: Math.ceil(JSON.stringify(output).length / 4),
      model: "demo-extractive-v1",
    };
  }
}
