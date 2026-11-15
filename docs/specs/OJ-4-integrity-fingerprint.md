# OJ-4: Language-aware similarity fingerprint

Status: draft (retroactive: the code exists as uncommitted work on top of dbb5168)
Owner: Htet Oo Naing
Risky area: no

## Outcome

Similarity checks catch renamed copies, ignore comments and formatting, skip trivial programs, and stay linear on hostile input. A 64 KB adversarial submission can no longer stall the integrity check.

## Scope

In: `integrity/domain/fingerprint.ts`, a tokenizer that now takes the submission language, and `integrity.service.ts`, which passes the language.
Out: cross-language comparison, and changing the similarity threshold.

## Done when

- [ ] A renamed copy is detected, a different program is not, and trivial code is skipped (`fingerprint.test.ts`).
- [ ] Hostile 64 KB inputs tokenize in linear time (`fingerprint.test.ts`).
- [ ] Review nit N6 fixed or accepted: C++14 digit separators (`1'000'000`) are not read as character literals.
- [ ] `pnpm build:shared && pnpm typecheck && pnpm test` pass.

## Contexts and contracts

Integrity only. No contract change.

## Security

None beyond the denial-of-service bound above.

## Tests

`fingerprint.test.ts`.

## Rollout and risks

Similarity scores change for existing pairs, so tell teachers before an exam that the flags may differ from earlier runs.
