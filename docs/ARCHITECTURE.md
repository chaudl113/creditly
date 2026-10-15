# Architecture

```
 Browser ──► Next.js (App Router, server components + server actions)
              │  src/lib/auth/session.ts   DAL: every request resolves the user from the DB
              │
              ├─ src/lib/ledger      double-entry credit ledger ─┐
              ├─ src/lib/credits.ts  grants, purchases, holds    │
              ├─ src/lib/ai          reserve → provider → settle │──► Postgres
              ├─ src/lib/billing     checkout, webhooks          │    (constraint triggers,
              └─ src/lib/admin       audited admin writes ───────┘     append-only tables)
                     │                    ▲
                     ▼                    │ signed events
                  Stripe API ──────► /api/stripe/webhook
            (stripe-mock in test)   (local simulator in test mode)
                     
              Anthropic API (or offline demo provider)      Mailpit (SMTP)
```

## Decisions

| Decision | Why | Trade-off |
| --- | --- | --- |
| Balance = `SUM(entries)`, no balance column | One source of truth; nothing to drift | Balance reads aggregate; fine at this scale, add snapshots if wallets get huge |
| Invariants in Postgres (deferred constraint triggers, append-only triggers) | Holds even for code paths that forget a check, and for manual SQL | Logic split between TS and SQL; covered by tests that try to break it |
| Lock only user wallets, in sorted order | Prevents overspend races without serialising everything on a system account | System accounts may briefly be read mid-flight; they have no "must be ≥ 0" rule |
| Natural idempotency keys (`invoice:<id>:grant`, `job:<id>:close`, …) | Retries and duplicate webhooks become no-ops at the ledger level | Keys must be designed per operation |
| Store webhook event first, then apply in one transaction | Exactly-once effects, full delivery history for admins | Failed events are retried by Stripe, not by a local queue |
| Subscription state ordered by `event.created` | Out-of-order delivery can't regress state | Two events with the same second: the one delivered last wins |
| AI provider call outside DB transactions | No locks held during a 10–90 s network call | Needs the stale-job sweeper (10 min) for crashed processes |
| Admin refund holds the payment row lock across the Stripe call | Serialises refunds and the matching webhook; no double clawback | Lock held for up to the Stripe timeout; acceptable for an admin-only action |
| Role read from DB on every request (JWT holds only user id + issue time) | Demotions and password resets take effect immediately | One extra query per request |
| `cacheComponents` off | Every screen shows per-user money data | No static shell; pages are fully dynamic |
| Test mode simulator for Checkout/Portal | stripe-mock has no hosted pages or webhooks | Simulated event payloads must track Stripe's shapes (pinned API version) |
| Public demo: one-click sign-in is a second Credentials provider (`demo`), registered only when `DEMO_PUBLIC=1` | No shared password in the page or the client bundle; the button is an ordinary server action | Anyone can become the demo admin, by design; data resets nightly |
| Auth rate limits as a fixed-window counter in Postgres (one upsert per hit) | Survives restarts and multiple instances without Redis | Fixed windows allow a burst at the boundary; good enough for auth throttling |
| Demo reset truncates the tables declared in the Drizzle schema, without `CASCADE` | Cannot touch another app's tables on a shared Postgres | Not atomic with the re-seed (~1 s window with partial data) |

## Known limitations

- URL fetching resolves DNS before connecting; a DNS-rebinding attacker could still
  race the check (TOCTOU). Production would pin the resolved IP or use an egress proxy.
- Unused Pro credits roll over indefinitely; there is no expiry policy.
- Refunds clawback at most the credits the user still has; spent credits stay spent.
- Invoices created under newer Stripe API versions may not carry a payment intent;
  they cannot be refunded from the admin UI, and their `charge.refunded` webhook can't be
  matched (it fails and is visible in the webhook log); the credit clawback then needs a
  manual adjustment.
- Ledger timestamps are the time of posting, not the Stripe event time.
- Public demo: the client IP comes from a header (`cf-connecting-ip`). If the
  origin is reachable without Cloudflare, that header can be forged and the
  per-IP limits bypassed; firewall the origin to Cloudflare's ranges.
- Public demo: visitors share one admin account, so one visitor can refund or
  adjust another visitor's demo data until the nightly reset.
