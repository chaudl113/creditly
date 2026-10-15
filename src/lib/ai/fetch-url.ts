import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { ProviderError } from "./types";

/**
 * Fetches a public web page as plain text. Guards against SSRF: only
 * http(s), every hop's host must resolve to a public address, redirects are
 * followed manually (max 3) and re-checked, with a timeout and a size cap.
 */
const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 8_000;

export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80") || v6.startsWith("ff");
}

async function assertPublicHost(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new ProviderError("Only http and https URLs are supported");
  if (url.username || url.password) throw new ProviderError("URLs with credentials are not allowed");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (addresses.length === 0) throw new ProviderError(`Could not resolve ${host}`);
  if (addresses.some((a) => isPrivateAddress(a.address))) throw new ProviderError("That address is not publicly reachable");
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|br|section|article)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

export async function fetchUrlText(raw: string): Promise<string> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ProviderError("That is not a valid URL");
  }
  for (let hop = 0; hop <= 3; hop++) {
    await assertPublicHost(url);
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "user-agent": "CreditlyBot/1.0 (+summarizer)", accept: "text/html,text/plain" },
    }).catch((e: Error) => {
      throw new ProviderError(`Could not fetch the page: ${e.message}`);
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url);
      continue;
    }
    if (!res.ok) throw new ProviderError(`The page returned HTTP ${res.status}`);
    const type = res.headers.get("content-type") ?? "";
    if (!/text\/(html|plain)|application\/xhtml/.test(type)) throw new ProviderError(`Unsupported content type ${type || "unknown"}`);
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_BYTES) throw new ProviderError("The page is too large");
    const body = await res.text();
    if (body.length > MAX_BYTES) throw new ProviderError("The page is too large");
    return type.includes("html") ? htmlToText(body) : body;
  }
  throw new ProviderError("Too many redirects");
}
