# Phase 5 — Quests & Scripting Automation

> Part of the [roadmap](./README.md). Delivers the objective in
> [`../docs/VISION.md`](../docs/VISION.md). **Status: ✅ Done** — FTB Quests SNBT generation
> (spec [`0011`](../specs/0011-ftbquests-generation/spec.md)) **and** KubeJS script generation
> (spec [`0012`](../specs/0012-kubejs-generation/spec.md)) are both **done**; the
> **natural-language front door** (spec [`0020`](../specs/0020-nl-quest-script-authoring/spec.md))
> that drafts those structured definitions from a plain-language description — then funnels them
> through the **same** `0011`/`0012` validators before any write — is **done** too.

## 1. Goal / outcome

The assistant can **author content**, not just assemble mods: generate **FTB Quests** content
and **KubeJS** scripts from a high-level description, with every generated artifact
**validated** before it touches the instance. This turns "I want a progression quest line for
my tech pack" into working files.

## 2. User-facing capabilities

- Describe a quest line ("chapter for early-game farming, three quests, rewards X/Y/Z") and
  get **valid FTB Quests SNBT** (chapters/quests/tasks/rewards + `lang` strings).
- Generate **KubeJS** scripts for custom recipes, items, and events — including reacting to
  quest progress via **FTB XMod Compat** `FTBQuestsEvents`.
- Have generated artifacts **validated** (item-ID/version checks, dependency-cycle checks)
  before they are written (with backup + confirmation).

## 3. Scope

**In:** FTB Quests **SNBT generation via a real serializer**; KubeJS script generation across
`startup_scripts/`/`server_scripts/`/`client_scripts/`; a **validation harness**
(item-ID/version checks, quest dependency-cycle checks, SNBT parse-back); writes via the
guarded `InstanceFs`.

**Out:** designing *good* quest *content* automatically beyond the user's description (the
assistant scaffolds and validates, the user directs); non-FTB quest systems; deep balancing.

## 4. Key technical work & components

- **SNBT serializer** (real NBT typing — byte/int/long/float/double, lists, compounds; **no
  regex/string templating**) and an FTB Quests model →
  [Domain §7.1–7.2](../docs/DOMAIN-KNOWLEDGE.md#7-quests--ftb-quests) (Constitution P3).
- **KubeJS** script emitter (Rhino/ES6) with correct script-folder lifecycle placement
  ([Domain §7.3](../docs/DOMAIN-KNOWLEDGE.md#73-kubejs-and-the-limits-of-ftbquestsevents)).
- **FTB XMod Compat** integration for **reactive** `FTBQuestsEvents` — used for dynamic
  task/reward behavior, **not** quest creation (which is SNBT) — per
  [Domain §7.3](../docs/DOMAIN-KNOWLEDGE.md#73-kubejs-and-the-limits-of-ftbquestsevents).
- **Validation harness:** SNBT must parse back; referenced item IDs exist for the pack's
  mods/versions; no quest dependency cycles.

## 5. Specs to be written

- ✅ [`0011-ftbquests-generation`](../specs/0011-ftbquests-generation/spec.md): the SNBT model +
  serializer (+ parser for parse-back) + validation. **Done.**
- ✅ [`0012-kubejs-generation`](../specs/0012-kubejs-generation/spec.md): script emitter (typed model +
  escaped literals) + reactive `FTBQuestsEvents` handlers + recipes + **real-engine parse-back** (a
  `ScriptValidator` port) + namespace/type/recipe/quest cross-validation. **Done.**
- ✅ [`0020-nl-quest-script-authoring`](../specs/0020-nl-quest-script-authoring/spec.md): the
  **natural-language front door** — the `0017` `ChatModel` drafts a structured
  `QuestDefinition`/`ScriptDefinition`, which is then validated by the **existing** `0011`/`0012`
  pipeline (item/dependency/cycle/quest-cross-ref + SNBT/JS parse-back) before any guarded write; a
  bounded re-draft loop on failure; surfaced on `quests`/`kubejs --describe`. **Done.**

(Authored when the phase starts.)

## 6. Dependencies

- **Phase 2** (a resolved set, so item IDs/mods are known for validation).
- **Phase 0** (guarded `InstanceFs`, logging).

## 7. Risks & open questions

- **SNBT format variance across FTB Quests versions** → pin to the target version; validate
  by parse-back ([Domain §7.1](../docs/DOMAIN-KNOWLEDGE.md#71-storage-format)).
- **Temptation to template SNBT as strings** → explicitly forbidden; a real serializer is a
  hard constitution requirement (P3).
- **Item-ID correctness** → validate against the resolved set; unknown IDs block the write.
- **KubeJS API drift** → ground in current docs; pin to versions used by the pack.

## 8. Definition of Done / exit criteria

- Generated FTB Quests SNBT **loads in-game without manual fixes**
  ([VISION success](../docs/VISION.md#definition-of-success)).
- Generated KubeJS scripts run without errors and (where applicable) react to quest events
  via FTB XMod Compat.
- The validation harness blocks invalid artifacts *before* any write; writes are backed up +
  confirmed.
- Constitution gates pass; specs marked `done`.

## 9. Success metrics

- % of generated quest/script artifacts that load/run with zero manual edits (target: high).
- Validation harness catches injected invalid artifacts 100% of the time in tests.
