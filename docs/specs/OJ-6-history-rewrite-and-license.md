# OJ-6: One-time history rewrite and LICENSE

Status: draft (runs only on Htet's explicit instruction)
Owner: Htet Oo Naing
Risky area: yes (git history of the shared remote)

## Outcome

Before the repository is shown outside (recruiters, students, open source), its history reads as a handful of meaningful Conventional Commits instead of "asd", and it carries a LICENSE. Week 0, item 1 in `docs/ai-engineering-playbook.md`.

## Scope

In: squash the existing commits on the default branch into a few logical commits; add `LICENSE`; scan the history for secrets before and after.
Out: changing code; any rewrite after other people have cloned without telling them first.

## Done when

- [ ] Choice of license recorded (MIT, Apache-2.0, or "all rights reserved" if the code stays private) and `LICENSE` added.
- [ ] A secret scan of the full history (e.g. `gitleaks detect`) reports nothing, or every hit is rotated before the rewrite.
- [ ] The new history has 3 to 8 commits, each passing commitlint, the last one tree-identical to the pre-rewrite tip (`git diff <old-tip> <new-tip>` is empty).
- [ ] A backup ref of the old history exists until Cuong Le and Htet have both re-cloned.
- [ ] Both collaborators confirm before the force push; branch protection is turned on right after.

## Contexts and contracts

None. Git only.

## Security

A rewrite does not remove secrets already pushed to GitHub (forks, caches): any secret found must be rotated regardless.

## Tests

`pnpm build:shared && pnpm typecheck && pnpm test` on the new tip.

## Rollout and risks

Coordinate a time with Cuong Le (all 14 original commits are his); both push pending work first. Force push once, then protect the branch. Rollback: push the backup ref. This is the only time `git push --force` is acceptable, and `.claude/settings.json` denies it to the assistant: Htet runs it.
