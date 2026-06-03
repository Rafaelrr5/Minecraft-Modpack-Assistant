# Plan 0001 — Modpack Discovery

> **Artifact:** `plan.md` — the **HOW** for [`spec.md`](./spec.md).

| | |
| --- | --- |
| **Spec ID** | `0001` |
| **Status** | `done` |
| **Implements** | [`spec.md`](./spec.md) |

---

## 1. Approach overview

Discovery is modeled as **conversational slot-filling over a typed `ModpackBrief`**, wrapped
by a **deterministic validator**. An LLM-led dialog (the agent layer) extracts values for
the brief's slots from natural conversation; after each turn, deterministic code computes
*completeness* (are all required slots filled?) and *consistency* (do the slots agree with
domain rules?). The conversation continues until the brief is complete and consistent, then
the user explicitly confirms.

This split keeps the **flexibility** of an LLM conversation while keeping **correctness**
deterministic — the model fills slots and explains; it does not get to *decide* that an
inconsistent brief is fine (Constitution
[P3](../../memory/constitution.md#principle-3--validation-discipline),
[P5](../../memory/constitution.md#principle-5--sourced--version-pinned-domain-knowledge)).

Rejected alternative: a fixed linear questionnaire — simpler but worse UX for experts (can't
short-circuit) and beginners (can't follow tangents); we keep the deterministic check it
would have given us and drop its rigidity.

## 2. Module & placement

- **Module:** `discovery` (see
  [ARCHITECTURE: capability modules](../../docs/ARCHITECTURE.md#capability-modules)).
- **Public contract (conceptual):**
  - `startDiscovery(seed?) → DiscoverySession`
  - `applyTurn(session, userInput) → { session, nextPrompt, brief?, issues[] }`
  - `validateBrief(brief) → ValidationResult`
  - `confirm(session) → ModpackBrief` (only succeeds when valid + user-confirmed)
- **CLI surface:** an interactive `discover` command that loops turns and prints the brief
  for confirmation. The CLI holds **no domain logic** — it only renders prompts and forwards
  input (Constitution P2).

## 3. Data contracts

`ModpackBrief` (conceptual schema; final field types fixed in implementation):

| Field | Type | Notes |
| --- | --- | --- |
| `theme` | string | The concept/theme (free text in v1). |
| `playstyle` | enum/free | e.g. exploration, tech, magic, combat, cozy. |
| `minecraftVersion` | `MinecraftVersion` | Pinned; carries required Java major. |
| `loader` | `Loader` | family + version. |
| `audienceLevel` | enum | `beginner` \| `expert` (detected/declared). |
| `distribution` | enum | `singleplayer` \| `server` (+ player count if server). |
| `performanceBudget` | struct | target RAM/`-Xmx` ceiling and/or "low/med/high" hint. |
| `difficulty` | enum/free | desired difficulty/ramp. |
| `mustHaveMechanics` | string[] | free-text intents (normalized later, Phase 2). |
| `defaultsApplied` | string[] | which fields used a default (for transparency). |
| `confirmedAt` | timestamp | set only on explicit confirmation. |

The brief is **declarative** (Constitution P7) and serializable so Phase 2+ consume it
directly.

## 4. Algorithms & logic

1. **Seed (optional).** If an expert provides a terse statement or mod list, pre-fill slots
   from it (LLM extraction + deterministic parse for obvious tokens like a version string or
   loader name).
2. **Turn loop.** For each user message: LLM updates slot candidates → deterministic
   `validateBrief` runs → if incomplete/inconsistent, generate the next question targeting
   the *most important missing/conflicting* slot (beginners get an explanation; experts get
   a terse prompt).
3. **`validateBrief` (deterministic, the correctness core):**
   - *Completeness:* all required FR-1 slots present.
   - *Consistency rules (sourced from
     [`DOMAIN-KNOWLEDGE.md`](../../docs/DOMAIN-KNOWLEDGE.md)):*
     - loader family supports the chosen `minecraftVersion` (§1);
     - `minecraftVersion` → required Java is recorded (§2) for later phases;
     - if `distribution = server`, must-haves flagged client-only are surfaced as a conflict
       (§4 side semantics);
     - `performanceBudget` is sane for the stated ambition (soft warning, not a hard block).
   - Returns structured `issues[]` (each: field, severity, explanation, suggested fix).
4. **Confirm.** Only when `validateBrief` is clean **and** the user explicitly confirms does
   `confirm()` stamp `confirmedAt` and emit the final `ModpackBrief`.

**Deterministic vs. LLM:** slot *extraction* and *phrasing* are LLM; *completeness*,
*consistency*, and *confirmation gating* are deterministic. The LLM never overrides a
validation failure.

## 5. External integrations

None in v1 — Discovery makes **no catalog calls** (that is Phase 2). Its only "external"
dependency is the domain-knowledge rules it encodes (versioning/loader/Java facts), which
live in [`DOMAIN-KNOWLEDGE.md`](../../docs/DOMAIN-KNOWLEDGE.md) and are kept version-pinned.

## 6. Safety & side effects

**Read-only.** Discovery never touches the user's `.minecraft` instance; it emits an
in-memory/serializable brief. No backup/confirm machinery needed beyond the user's explicit
brief confirmation (Constitution
[P4](../../memory/constitution.md#principle-4--user-data-safety-backup-consent-dry-run-by-default)
is satisfied by having no writes).

## 7. Validation & testing strategy

- **Unit tests** for `validateBrief`: completeness detection, each consistency rule (valid
  loader×version, server vs. client-only must-have, Java mapping recorded), and `issues[]`
  shape.
- **Scenario tests** mapping to acceptance criteria: vague-beginner → complete brief (AC-1);
  terse-expert → minimal-question brief (AC-2); inconsistent combo blocked until resolved
  (AC-3); confirmed brief is downstream-ready (AC-4); no game writes (AC-5).
- **LLM-dialog tests** use scripted transcripts (fixtures) so the deterministic layer is
  tested independently of model nondeterminism.

## 8. Observability

Log each turn's slot deltas and every validation issue with its rationale; expose a
"why this default?" explanation backed by the cited domain rule (Constitution P9).

## 9. Risks & mitigations

- **LLM mis-extraction / hallucinated facts** → deterministic validation + sourced rules
  catch inconsistencies; the model can't confirm an invalid brief.
- **Over-questioning experts** → seed + "ask only about missing/conflicting slots" keeps
  expert paths short (FR-7).
- **Free-text must-haves are hard to use later** → accepted for v1; normalization is an
  explicit Phase 2 concern (open question in the spec).

## 10. Rollout / sequencing

1. `ModpackBrief` type + `validateBrief` (pure, fully tested) — usable on its own.
2. Turn loop + slot extraction over scripted transcripts.
3. CLI `discover` command.
4. Expert seeding (FR-7).

Detailed steps in [`tasks.md`](./tasks.md).

---

## Constitution Re-check

All gates from [`spec.md`](./spec.md) hold under this design. The key reaffirmation: the
**deterministic validator**, not the LLM, owns completeness/consistency/confirmation (P3,
P5), and the feature remains **read-only** (P4). No gate status changed when design met
reality.
