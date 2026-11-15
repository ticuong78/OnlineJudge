# ADR 0005: AI access and allowances are a shared kernel

Date: 2026-11-14
Status: accepted (decision owner: Htet Oo Naing; recorded in OJ-28 after the senior review of OJ-26)

## Context

Every AI feature asks the same two questions before it calls Claude:
- **May this account use AI** (its plan)?
- **Is there a use left** this month and this minute?

The features live in four contexts: Catalog (section and title rewrites, test suggestions), Importing (documents and
photos), Integrity (AI-usage checks) and Identity (the usage endpoint).

CLAUDE.md rule 3 says contexts talk only through a published facade behind a local port. Taken literally, that means
three extra ports that only forward calls to Identity, each with an adapter and test doubles, and three places where
the allowance rules could drift apart.

## Decision

AI access and allowances form the one shared kernel, in `src/backend/src/shared/application`:
- `ai-access.ts`: the `AiAccess` port, `hasFullAi`, and `aiRequiresVip`;
- `ai-quota.ts`: the `AiQuota` use case, the `AiUsageStore` port, the plans' limits and the Vietnam-time month;
- `ai-availability.ts`: whether a Claude key is configured.

The kernel holds only abstract ports, one use case and pure rules. It never imports a module.

Identity implements the ports (`user-ai-access.ts`, `typeorm-ai-usage.store.ts`) and wires them in
`identity.module.ts`. Other contexts inject `AiQuota`, `AiAccess` and `AiAvailability` directly.

## Consequences

- **One place for the rules.** A plan's limits, the monthly reset and the "full AI" rule are defined once. They are
  tested in `ai-quota.test.ts`.
- **Cost:** a change to the kernel touches every AI feature, so it needs this ADR's reasoning to hold.
- **No other shared use cases** without a new ADR (CLAUDE.md rule 3).
- **If the kernel grows** beyond ports, one use case and pure rules (for example billing or invoices), move it into
  Identity behind a facade instead.
