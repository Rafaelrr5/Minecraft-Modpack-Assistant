# Phase 8 — Productization (SaaS)

> Part of the [roadmap](./README.md). Delivers the objective in
> [`../docs/VISION.md`](../docs/VISION.md). **Status: ⬜ Not started.**

## 1. Goal / outcome

Take the proven local engine and turn it into a **paid, multi-tenant SaaS**: the same core
capabilities, now behind a web application with accounts, billing, hosted compute for
build/launch validation, persistence, and collaboration. This is the
[vision's commercial future](../docs/VISION.md#the-future-from-cli-to-saas) — reached by
**adding adapters and infrastructure**, not rewriting the engine.

## 2. User-facing capabilities

- Use the assistant from a **web app** (no local install required for most flows).
- **Accounts**, saved packs, and **collaboration** on a pack.
- **Hosted build & sandbox-launch runners** that validate a pack (and reproduce/triage
  crashes) without using the user's own machine.
- **Subscription/billing** with tiers; broader **CurseForge-at-scale** sourcing under proper
  keys/licensing.

## 3. Scope

**In:** web API over the existing UI-agnostic core; multi-tenant persistence of `PackState`;
auth; billing/pricing tiers; hosted build/sandbox-launch runners for crash validation;
collaboration; **CurseForge at scale** (API key management + commercial licensing).

**Out:** changing the core domain logic (it is reused as-is); anything that would have been
cheaper to do in earlier phases (this phase *productizes*, it does not re-invent features).

## 4. Key technical work & components

- **Web/API adapter** over the same capability modules — enabled by the UI-agnostic core
  rule held since Phase 0 (Constitution P2;
  [ARCHITECTURE](../docs/ARCHITECTURE.md#from-cli-to-saas-phase-8-readiness)).
- **Multi-tenant persistence** of declarative `PackState` (Constitution P7).
- **Auth + billing** and pricing tiers.
- **Hosted runners** to build and **sandbox-launch** packs for crash validation (moves
  Phase 4's launch-for-validation off the user's machine).
- **CurseForge at scale:** `x-api-key` management + commercial licensing
  ([Domain §3.2](../docs/DOMAIN-KNOWLEDGE.md#32-curseforge-later-phase);
  [ADR 0004](../docs/decisions/0004-modrinth-first-data-source.md)).
- Persistence, collaboration, and team features.

## 5. Specs to be written

- `NNNN-web-api`, `NNNN-auth-billing`, `NNNN-hosted-build-runners`,
  `NNNN-curseforge-at-scale`, `NNNN-collaboration` (split as needed; authored when the phase
  starts).

## 6. Dependencies

- **Phases 1–7** — a complete, proven local product is the prerequisite for productizing.
- The **UI-agnostic core** discipline maintained throughout (the thing that makes this phase
  additive rather than a rewrite).

## 7. Risks & open questions

- **Hosted launching is heavy/risky** (running arbitrary mod code) → strong **sandboxing**
  and isolation for build/launch runners.
- **CurseForge commercial licensing** → must be secured before at-scale use
  (Constitution P6).
- **Multi-tenant data safety** → the same backup/consent ethos, now with tenant isolation and
  privacy obligations.
- **Pricing/packaging** of tiers → a product/business question, recorded when approached.

## 8. Definition of Done / exit criteria

- The web app exercises the **same core** as the CLI (no forked logic).
- A user can build and **validate** a pack via hosted runners.
- Auth, billing, and at-least-one paid tier function; CurseForge-at-scale operates under a
  valid license.
- Tenant data is isolated and safe. Constitution gates pass; specs `done`.

## 9. Success metrics

- Core-logic reuse between CLI and SaaS approaches 100% (no duplicated capability code).
- Hosted build/launch validation success and triage accuracy meet targets.
- Conversion/retention and reliability targets for the paid product (defined at launch).
