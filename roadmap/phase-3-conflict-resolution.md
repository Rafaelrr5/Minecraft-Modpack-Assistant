# Phase 3 — Conflict Resolution & Pre-flight ("one step ahead")

> Part of the [roadmap](./README.md). Delivers the objective in
> [`../docs/VISION.md`](../docs/VISION.md). **Status: ✅ Done.**
> **Spec:** [`0007-conflict-preflight`](../specs/0007-conflict-preflight/spec.md) (done —
> the `conflicts` capability: static conflict + keybinding detection over the resolved set →
> a read-only pre-flight report with proposed fixes, via `orchestrate --preflight`).

## 1. Goal / outcome

The assistant's **signature capability**: before the pack is ever launched, detect the
conflicts that normally cause crashes or broken gameplay and **propose resolutions** — so the
user fixes problems they didn't know were coming. This is the most direct expression of
[**"one step ahead"**](../docs/VISION.md#what-one-step-ahead-means).

## 2. User-facing capabilities

A **pre-flight report** over the resolved set, flagging and proposing fixes for:

- **Duplicate `modId`** (two jars claiming the same id).
- **Declared incompatibilities** (`breaks`/`conflicts`; `incompatible`/`discouraged`).
- **Version conflicts** (a dependency present but outside its `versionRange`).
- **Client/server-side mismatches** (a client-only mod on a server, etc.).
- **Known-bad combinations** (curated list).
- **Keybinding collisions** (two mods defaulting to the same key), with a proposed remap.

## 3. Scope

**In:** static conflict detection from mod metadata + a curated known-bad list; keybinding
collision detection against defaults and `options.txt`; proactive resolution proposals; a
pre-flight report.

**Out:** runtime-only conflicts that truly require a launch to observe (registry/mixin
clashes are *suspected* here and confirmed in Phase 4); actually applying fixes to an instance
(that goes through the guarded build path, Phase 4).

## 4. Key technical work & components

- `conflicts` module consuming the resolved `PackState` and parsed metadata
  ([Domain §4](../docs/DOMAIN-KNOWLEDGE.md#4-mod-metadata--dependency-declarations)).
- Implement the **conflict taxonomy**
  ([Domain §4.3](../docs/DOMAIN-KNOWLEDGE.md#43-conflict-categories-taxonomy)); mark which are
  *statically certain* vs. *suspected* (Constitution P5 — flag uncertainty).
- **Keybinding** collision engine ([Domain §5](../docs/DOMAIN-KNOWLEDGE.md#5-keybindings))
  with non-conflicting remap proposals.
- A curated, sourced **known-bad-combinations** dataset.
- Resolution proposals presented for user choice; nothing applied silently (Constitution P4).

## 5. Specs to be written

- `NNNN-conflict-preflight`: static conflict + keybinding detection and resolution proposals.
- Possibly `NNNN-known-bad-combos`: the curated dataset and its update process.

(Authored when the phase starts.)

## 6. Dependencies

- **Phase 2** (a resolved, dependency-complete set with parsed metadata).
- Metadata parsers from **Phase 0/2**.

## 7. Risks & open questions

- **False positives/negatives** → distinguish *certain* (duplicate id, declared
  incompatibility, side mismatch, version range) from *suspected* (registry/mixin); be honest
  about confidence.
- **Keybinding defaults aren't always declared in metadata** → may require per-mod knowledge
  or heuristics; degrade gracefully and say so.
- **Known-bad list maintenance** → needs a sourced, versioned update process.

## 8. Definition of Done / exit criteria

- The pre-flight report correctly flags seeded examples of each *statically detectable*
  category and proposes a resolution for each.
- Keybinding collisions among a sample set are detected with a valid non-conflicting remap.
- No fix is applied without explicit user consent.
- Constitution gates pass; specs marked `done`.

## 9. Success metrics

- High recall on statically-detectable conflicts (duplicate id, declared incompat, version,
  side) with low false-positive rate.
- Measurable reduction in first-launch failures attributable to these categories (validated
  in Phase 4).
