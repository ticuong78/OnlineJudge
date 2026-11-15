# OJ-<n>: <title>

Status: draft | approved | done
Owner: <name>
Risky area: no | yes (<which>)

## Outcome

One or two sentences: who gets what, and why now.

## Scope

In:
Out:

## Done when

- [ ] <observable behaviour: endpoint, screen, test, metric>
- [ ] <...>

## Contexts and contracts

Contexts touched and the dependency direction check. New or changed types in `@oj/contracts`. Entities and the migration that will be needed.

## AI (delete if not applicable)

Data sent to the model (fields; anything personal, especially about students, and why it is needed). Before-and-after check (playbook section 6): inputs used and results.

Task, model variable, prompt location, zod schema, estimated cost per call, fallback when the key is missing or the output is invalid.

## Security

Roles on each new route, actor scoping of each new query, input limits, data sent outside the system.

## Tests

Files to add or change and the cases they cover.

## Rollout and risks

Order of merges, data backfill, what to watch after deploy, how to roll back.
