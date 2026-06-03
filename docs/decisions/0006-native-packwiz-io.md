# ADR 0006 — Native (in-process) packwiz I/O, no CLI shell-out

| | |
| --- | --- |
| **Status** | accepted |
| **Date** | 2026-06-03 |
| **Deciders** | Project owner + Claude |
| **Related** | [ADR 0005 (pack formats)](./0005-packwiz-and-mrpack-pack-format.md), [`DOMAIN-KNOWLEDGE.md §8`](../DOMAIN-KNOWLEDGE.md#8-packaging--distribution-formats), [spec `0005` (pack state)](../../specs/0005-pack-state/spec.md), [Phase 0](../../roadmap/phase-0-foundation.md) |

---

## Context

[ADR 0005](./0005-packwiz-and-mrpack-pack-format.md) made **packwiz** the development source
of truth for the declarative `PackState`. packwiz ships a real **CLI** (and an HTTP bootstrap
installer), so spec `0005` faced a concrete choice: **produce/consume the packwiz TOML tree
ourselves**, or **shell out to the packwiz binary** for read/write operations. ADR 0005 even
flagged a "possible dependency on the external packwiz CLI." The packwiz on-disk format is
simple, well-documented TOML — `pack.toml`, `index.toml`, and per-mod `*.pw.toml`
([Domain §8](../DOMAIN-KNOWLEDGE.md#8-packaging--distribution-formats)) — which makes this a
real, non-obvious trade-off rather than a foregone conclusion.

The decision is constrained by the constitution: **validation discipline** (generated files
must parse/validate, not be string-built — P3), **determinism/testability** (P3/P9), and the
**CLI→SaaS path** (P2), where requiring an external binary in a multi-tenant server is
friction.

## Decision

**We will implement packwiz read/write natively in TypeScript, in-process, using a real TOML
serializer — and will NOT shell out to the packwiz CLI for `PackState` I/O.** The packwiz
layout is generated and parsed by our own `integration/packwiz/` adapter behind the
`PackFormat` port; every generated TOML file is re-parsed to validate before it is trusted.

## Options considered

- **Option A — Native in-process TOML I/O (chosen).** Use a real TOML library to
  build/parse the packwiz tree ourselves.
  *Pros:* no external binary to install/version; deterministic and unit-testable (temp-dir
  round-trip); works unchanged in a future hosted/SaaS runner; full control over validation
  (re-parse before trust, P3).
  *Cons:* we must track the packwiz format ourselves and keep up with any format changes.
- **Option B — Shell out to the packwiz CLI.** Invoke `packwiz` for init/add/refresh.
  *Cons:* an external binary becomes a hard runtime/CI/SaaS dependency; cross-platform and
  version-drift friction; harder to test deterministically; subprocess error handling; weaker
  control over the validation gate. *Pros:* always matches the canonical format.
- **Option C — Hybrid (native now, optional CLI later).** Native by default, with an optional
  CLI path for operations we don't implement.
  *Cons:* two code paths and a conditional dependency before there's a need (YAGNI, P9).
  Re-openable later via a new ADR if a packwiz-only operation becomes necessary.

## Consequences

- **Positive:** zero external-binary dependency; deterministic, fast, fully test-covered
  round-trip (spec `0005`); the same code runs locally and in a future SaaS runner; the
  validation gate (re-parse generated TOML) is entirely ours (P3).
- **Negative / trade-offs:** we own a mapping to the packwiz format and must re-verify it
  against the packwiz spec when that format evolves (tracked in
  [Domain §8](../DOMAIN-KNOWLEDGE.md#8-packaging--distribution-formats); flagged per P5).
- **Follow-ups:** if a future phase needs a packwiz operation that is impractical to
  reimplement (e.g. a specialized installer behavior), revisit with a new ADR rather than
  silently adding a CLI dependency. `.mrpack`/CurseForge **export** (Phase 7) remains a
  separate projection behind the same `PackFormat` seam.

## Relationship to the constitution / vision

Serves **P3** (we control the parse/validate gate on generated artifacts), **P7** (the
declarative, reproducible pack state is produced deterministically), **P2** (no binary
coupling that would complicate the CLI→SaaS move), and **P9** (simplest thing that satisfies
spec `0005`; no speculative second code path). It keeps ADR 0005's promise — packwiz as the
git-friendly dev source of truth — while removing the external-CLI risk that ADR flagged.
