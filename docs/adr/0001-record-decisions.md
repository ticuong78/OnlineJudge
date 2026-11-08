# ADR 0001: Record architecture decisions

Date: 2026-11-07
Status: accepted

## Context

The project is built quickly with an AI assistant. Decisions that are not written down get re-decided, often differently, in the next session.

## Decision

Every decision that constrains future work (a boundary, a storage choice, a security trade-off, a dependency) is recorded here as `NNNN-<slug>.md` with Context, Decision and Consequences. The first ones to write: token storage (localStorage versus httpOnly cookie), migrations instead of `DB_SYNC`, and the sandbox hardening baseline.

## Consequences

Reviewers can point to a record instead of re-arguing; the assistant reads them through `CLAUDE.md` references; changing a decision means a new record that supersedes the old one.
