# Spec 0010 — Crash & Log Diagnosis

> **Artifact:** `spec.md` — **WHAT & WHY**. Describe capability via users,
> requirements, acceptance criteria. **No implementation detail** — belongs in
> [`plan.md`](./plan.md). (Constitution
> [P1](../../memory/constitution.md#principle-1--spec-first-no-capability-without-a-spec).)

| | |
| --- | --- |
| **Spec ID** | `0010` |
| **Status** | `done` |
| **Roadmap phase** | [Phase 4 — Build, Launch & Crash Diagnosis](../../roadmap/phase-4-build-launch-crash-diagnosis.md) |
| **Author / date** | Claude Code · 06/06/2026 |
| **Related specs** | consumes logs from instances built by [`0008`](../0008-build-instance/spec.md) via the guarded `InstanceFs` from [`0003`](../0003-project-foundation/spec.md); **confirms/clears the *suspected* conflicts** raised by pre-flight [`0007`](../0007-conflict-preflight/spec.md); remediations point back to [`0002`](../0002-system-requirements-prediction/spec.md) (Java/`-Xmx`) and [`0006`](../0006-mod-orchestration/spec.md) (deps); a possible second opinion rides the agent/LLM-adjacent provider seam alongside [`0009`](../0009-nvidia-chat-model/spec.md) |

---

## 1. Summary

When a built pack crashes, turn its **crash report and logs** into a **categorized diagnosis**
and **concrete remediation steps** — in plain language for a beginner, with full evidence for
an expert. Read the evidence that already exists on disk (`crash-reports/crash-*.txt`,
`logs/latest.log`) through the **guarded `InstanceFs`** (read-only), classify the failure into
the **crash taxonomy** ([DOMAIN-KNOWLEDGE §6.2](../../docs/DOMAIN-KNOWLEDGE.md#62-crash-categories-taxonomy))
with our own **deterministic heuristics**, optionally take **mclo.gs** as a *second opinion*
(never the sole authority — [§6.3](../../docs/DOMAIN-KNOWLEDGE.md#63-mclogs-analyse-api)), and
emit a report that tells the user **what broke, how sure we are, and what to do next**. A real
crash log is also the first chance to **confirm or clear** the *suspected* registry/mixin/side
conflicts pre-flight (`0007`) could only flag. This is where "one step ahead" closes the loop:
the pack we sized, resolved, conflict-checked and built finally meets reality, and we explain
the outcome instead of leaving the user to read a stack trace.

## 2. Problem & motivation

A modded launch fails in a handful of recognizable ways — wrong Java for the Minecraft
version ([§2](../../docs/DOMAIN-KNOWLEDGE.md#2-java-version-by-minecraft-version)), an
out-of-memory heap, a missing dependency, a mixin that failed to apply, a client-only class
loaded on a server, or a plain mod exception
([§6.2](../../docs/DOMAIN-KNOWLEDGE.md#62-crash-categories-taxonomy)). The evidence is right
there in `crash-reports/` and `logs/latest.log`
([§6.1](../../docs/DOMAIN-KNOWLEDGE.md#61-where-the-evidence-lives)), but a beginner sees an
unreadable wall of stack frames and an expert wastes time hunting the one line that matters.
Every other capability in this product works to *prevent* problems; this one exists for when a
problem still happens, to **name it, prove it, and fix it** — and to upgrade the honest
"suspected" verdicts from `0007` into confirmed/cleared facts now that a launch actually
happened. It is the last missing piece of Phase 4's promise.

## 3. Users & audience

Both audiences (Constitution
[P8](../../memory/constitution.md#principle-8--dual-audience-progressive-disclosure)):

- **Beginner** — runs one command pointed at the instance, gets a short, plain answer
  ("Your pack ran out of memory — raise allocated RAM to N MB and rebuild") with the single
  most likely cause first. No need to know where logs live or how to read a trace.
- **Expert** — gets every finding with its **matched evidence line(s)**, the category and a
  **certain/suspected** label, the offending mod id(s), the raw second-opinion analysis when
  requested, and remediation detail (exact Java major, exact `-Xmx`, the dependency to add).
  Nothing is hidden or guessed.

## 4. User stories

- As **any user**, when my pack crashes, I want to point the tool at my instance and get a
  **plain-language diagnosis** naming the most likely cause, so I am not reading stack traces.
- As **any user**, I want **concrete next steps** tied to the diagnosis (set Java 21, raise
  `-Xmx`, add the missing mod, remove the client-only mod on a server), so I know exactly what
  to change.
- As an **expert**, I want each finding backed by the **exact log line(s)** and an honest
  **certain vs suspected** label, so I can trust or overrule it.
- As an **expert**, I want an optional **second opinion** (mclo.gs) shown *alongside* — never
  instead of — our own heuristics, so I get corroboration without ceding authority.
- As a **prior phase** (`0007`), I want a real crash log used to **confirm or clear** the
  registry/mixin/side conflicts I could only mark *suspected*, so the user's picture sharpens
  after launch.
- As **any user**, I want diagnosis to be **read-only** — looking at my logs must never change
  my instance (Constitution P4).

## 5. Functional requirements

- **FR-1** — Given the text of a crash report and/or a log, the system MUST classify the
  failure into the crash taxonomy
  ([§6.2](../../docs/DOMAIN-KNOWLEDGE.md#62-crash-categories-taxonomy)): **missing-dependency,
  mixin-apply, out-of-memory, wrong-java, invalid-side**, falling back to
  **generic-mod-exception** keyed to the offending mod id from the trace.
- **FR-2** — Each finding MUST carry an honest **certainty** (`certain` when a signature line
  proves it, e.g. `java.lang.OutOfMemoryError`; `suspected` when only weakly inferred), the
  **matched evidence** (the log line(s) and their line numbers), and the **mod id(s)** involved
  when derivable (Constitution P9: explainable).
- **FR-3** — Each finding MUST carry a **remediation proposal**: a beginner-facing one-liner
  and optional expert detail, tied to a category-specific action — set the **correct Java
  major** for the MC version ([§2](../../docs/DOMAIN-KNOWLEDGE.md#2-java-version-by-minecraft-version)),
  raise **`-Xmx`** toward the `RequirementsReport` figure (`0002`), **add a missing
  dependency** (`0006`), **remove/relocate** a side-mismatched mod, or **update/remove** an
  offending mod. Remediations are **data only — proposed, never applied** (Constitution P4).
- **FR-4** — When the caller supplies the prior pre-flight report (`0007`), the system MUST
  **reconcile** it against the crash evidence: a *suspected* mixin/registry/side conflict whose
  mods appear in a matching crash finding is reported as **confirmed**; the report MUST be able
  to state which suspicions the log corroborates. (Clearing suspicions on a *clean* launch is
  noted but bounded — see §9.)
- **FR-5** — The system MAY consult **mclo.gs analyse**
  ([§6.3](../../docs/DOMAIN-KNOWLEDGE.md#63-mclogs-analyse-api)) as a **second opinion** behind
  a provider-agnostic port. Its analysis MUST be shown **alongside** our findings and clearly
  attributed, **never** as the sole authority (Constitution P3/P5). It MUST be **opt-in**;
  default diagnosis runs fully **offline**.
- **FR-6** — All reading of instance files MUST go through the guarded **`InstanceFs`**
  (`readText`, read-only); the diagnosis core MUST perform **no filesystem and no network I/O**
  itself — text and any second opinion are passed *in* (mirrors `0007`'s `options.txt` intake).
- **FR-7** — The capability MUST be **read-only end to end**: running a diagnosis MUST NOT write
  to, back up, or otherwise mutate the instance (Constitution P4).
- **FR-8** — A report MUST include an at-a-glance **summary**: counts per category and
  certain/suspected totals, plus the single **most likely** cause surfaced first (P8).
- **FR-9** — The capability SHOULD be exercised through the CLI as a **`diagnose`** command
  that locates `crash-reports/` + `logs/latest.log` under `--instance` (read-only), prints the
  diagnosis, and consults mclo.gs only with an explicit `--mclogs` flag. `help` MUST list it.
- **FR-10** — Core diagnosis logic MUST stay **UI-agnostic** and **deterministic**: no `cli/`
  import, no `node:fs`, no network (enforced by test as in `0006`/`0007`/`0008`); given the same
  text it returns the same report.

## 6. Non-functional requirements

- **Read-only & safe (P4).** Diagnosis never mutates the instance; reads go through the guarded
  `InstanceFs.readText`, which refuses paths escaping the instance dir. No backup needed because
  nothing is written.
- **Deterministic & offline-testable (P3).** Heuristics are pattern matches over text; the same
  log yields the same findings. Tests run on **seeded fixture logs — one per taxonomy
  category** — with no network and no real instance.
- **Honest, not authoritative (P3/P5).** Certainty labels are conservative; the mclo.gs second
  opinion is corroboration, never gospel; uncertainty is surfaced, not hidden.
- **Provider-agnostic second opinion (P6).** mclo.gs sits behind a port; the external client has
  a **contract test** against a recorded fixture; another analyser could replace it without
  touching the core.
- **Observable (P9).** Diagnosis logs the categories it matched and whether a second opinion was
  consulted — enough to explain the verdict.

## 7. Inputs & outputs (contract sketch)

- **Inputs:** the **text** of a crash report and/or `logs/latest.log` (located and read by the
  CLI via guarded `InstanceFs.readText`); optionally the **Minecraft version + loader** (parsed
  from the crash report's system-details block or supplied) to ground Java/side remediation;
  optionally the prior [`PreflightReport`](../0007-conflict-preflight/spec.md) (`0007`) to
  reconcile; optionally a pre-fetched **mclo.gs analysis** (second opinion). The
  [domain conflict model](../../docs/ARCHITECTURE.md#core-domain-model) is reused for
  reconciliation.
- **Outputs:** a **`DiagnosisReport`** — ordered **findings** (category, certainty, evidence
  line(s), mod id(s), remediation), the **reconciliation result** (which suspected conflicts the
  log confirms), the merged **second-opinion** notes when present, and a **summary** (per-category
  counts, certain/suspected totals, most-likely cause). Field-level schema lives in
  [`plan.md`](./plan.md).

## 8. Acceptance criteria

- **AC-1** — *(FR-1/FR-2)* Given a seeded crash log for each taxonomy category, When diagnosis
  runs, Then each is classified into its **correct category** with the **matched evidence line**
  attached and an appropriate certainty.
- **AC-2** — *(FR-1)* Given a `java.lang.OutOfMemoryError: Java heap space` line, Then the
  finding is **out-of-memory** with certainty **certain**; given `UnsupportedClassVersionError`,
  the finding is **wrong-java**; given `Mixin apply failed`, **mixin-apply**.
- **AC-3** — *(FR-3)* Given a **wrong-java** finding with the crash report's MC version = `1.21.1`,
  Then remediation names **Java 21** (per [§2](../../docs/DOMAIN-KNOWLEDGE.md#2-java-version-by-minecraft-version));
  given **out-of-memory**, remediation proposes **raising `-Xmx`** (referencing the `0002` figure
  when available). Remediations are returned as data and the instance is unchanged.
- **AC-4** — *(FR-4)* Given a prior pre-flight report with a **suspected** mixin conflict between
  mods A and B, When a crash log shows a mixin-apply failure naming A, Then the report marks that
  suspicion **confirmed**.
- **AC-5** — *(FR-5)* Given `--mclogs` is **not** set, When diagnosis runs, Then **no network
  call** is made and a full diagnosis is still produced; Given it **is** set, Then the mclo.gs
  analysis is shown **alongside** our findings and attributed as a second opinion.
- **AC-6** — *(FR-6/FR-7/FR-10)* The `crash-diagnosis` core performs **no I/O** and never imports
  `node:fs` or the CLI (enforced by test, as in `0007`/`0008`); running `diagnose` writes
  **nothing** to the instance.
- **AC-7** — *(FR-8)* A report exposes per-category counts, certain/suspected totals, and the
  **most likely** cause first.
- **AC-8** — *(FR-9)* `diagnose --instance <dir>` reads the crash report/log read-only and prints
  the diagnosis; `--mclogs` opts into the second opinion; `help` lists the command.
- **AC-9** — *(FR-5, P6)* The mclo.gs client has a **contract test** against a recorded fixture and
  runs with **no real network**.

## 9. Out of scope

- **Spawning the JVM / observing a live run.** As in `0008`, local launching is
  environment-sensitive ([roadmap risk](../../roadmap/phase-4-build-launch-crash-diagnosis.md#7-risks--open-questions));
  we diagnose **artifacts** (logs/crash reports), we do not launch. Hosted runners are Phase 8.
- **Auto-applying remediations / a closed apply→relaunch→re-diagnose loop.** We **propose**
  fixes; *applying* them re-uses the already-guarded `build` (`0008`) / `orchestrate` (`0006`)
  paths the user re-runs. A one-command auto-loop is deferred (Constitution P9, YAGNI).
- **Clearing every suspicion from a clean log.** We **confirm** suspicions a crash corroborates;
  positively *clearing* a suspicion requires evidence of a successful far-enough launch, which we
  treat conservatively (a suspicion not corroborated stays *suspected*, not silently cleared).
- **Uploading the user's log anywhere by default.** mclo.gs is opt-in; we never transmit a log
  without the explicit `--mclogs` flag (privacy + P4 spirit).
- **Crash categories beyond the §6.2 taxonomy** (e.g. native/driver GPU crashes) — recognized as
  `generic-mod-exception` for now; richer categories are a later increment.

## 10. Open questions

- **mclo.gs upload vs analyse-only.** The API offers `POST /1/log` (upload, returns an id) then
  `POST /1/analyse`. *Default for v1:* analyse the log content we already hold; treat the result
  as advisory; keep the client minimal and behind the port so the exact call shape can evolve.
- **Where MC version/loader come from.** Parsed from the crash report's *system details* block
  when present, else supplied by the caller (e.g. from `PackState`). *Default for v1:* prefer the
  parsed block, fall back to caller-supplied, and degrade the Java-specific remediation to generic
  guidance if neither is known (P5: don't guess).
- **Ranking when multiple categories match.** *Default for v1:* a fixed severity order
  (wrong-java / out-of-memory / missing-dependency / mixin-apply / invalid-side /
  generic-mod-exception) surfaces the most actionable root cause first; revisit with real data.

---

## Constitution Gate

| # | Principle | Status | Notes |
| --- | --- | --- | --- |
| 1 | Spec-first | **Pass** | Spec precedes any `crash-diagnosis` code; completes Phase 4 under SDD. |
| 2 | Module-first, CLI-first, UI-agnostic core | **Pass** | New `core/crash-diagnosis/` with a typed contract; reads only via injected `InstanceFs`; `diagnose` is a thin CLI surface; AC-6 enforces no `node:fs`/`cli` import. |
| 3 | Validation discipline | **Pass** | Deterministic pattern heuristics over text, seeded fixture per category; mclo.gs second opinion validated as advisory, never sole authority, with a contract test (AC-9). |
| 4 | User-data safety | **Pass** | Read-only end to end (FR-7); reads through guarded `InstanceFs.readText`; remediations are data, applied by nothing here; mclo.gs upload is opt-in (no silent log transmission). |
| 5 | Sourced & version-pinned knowledge | **Pass** | Taxonomy, evidence locations and Java-by-MC all cite DOMAIN-KNOWLEDGE §2/§6; uncertainty surfaced via certainty labels; second opinion attributed, not trusted blindly. |
| 6 | Provider-agnostic & licensing-aware | **Pass** | mclo.gs sits behind a `LogAnalysisProvider` port (first adapter), swappable; respects the service as advisory; no ToS-violating bulk use. |
| 7 | Declarative, reproducible pack state | **N/A** | Diagnosis reads runtime artifacts (logs), not the declarative pack state; its remediations point back to the declarative paths (`0002`/`0006`/`0008`) rather than mutating state here. |
| 8 | Dual-audience progressive disclosure | **Pass** | Beginner gets the single most-likely cause + one-line fix; expert gets evidence lines, certainty, mod ids, raw second opinion, and exact remediation values. |
| 9 | Simplicity, YAGNI & observability | **Pass** | v1 diagnoses artifacts and *proposes* fixes (no auto-loop, no JVM spawn); logs matched categories and whether a second opinion was used. |
