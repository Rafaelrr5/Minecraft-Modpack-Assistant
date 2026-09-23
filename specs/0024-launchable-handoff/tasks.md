# Spec 0024 — Tasks

> **Artifact:** `tasks.md` — ordered, verifiable units of work for [`spec.md`](./spec.md) / [`plan.md`](./plan.md).

| | |
| --- | --- |
| **Status** | `done` |

| Task | Description | Verified by | Status |
| --- | --- | --- | --- |
| T-0024-01 | Record the decision as [ADR 0009](../../docs/decisions/0009-launcher-handoff-for-client-launch.md); add it to the ADR index | ADR file + index row | done |
| T-0024-02 | Add the `LauncherMetaProvider` port (`true`/`false`/`undefined` verdicts) | `src/core/ports/launcher-meta-provider.ts`, exported from the ports barrel | done |
| T-0024-03 | Core types: targets, components, verdicts, artifact, plan, result, limitations | `src/core/launchable/types.ts` | done |
| T-0024-04 | Pure Prism assembly: component list per loader family, `mmc-pack.json`, `instance.cfg`, parse-back validation | `prism.test.ts` — AC-1, AC-2, AC-9 | done |
| T-0024-05 | Modrinth App target: reuse spec 0015 `.mrpack`, add the `-Xmx` caveat + steps | `launchable.test.ts` — AC-6 | done |
| T-0024-06 | Verification pass: refuse on `false`, warn and stay `unknown` on a failed lookup | `launchable.test.ts` — AC-3, AC-4 | done |
| T-0024-07 | Guarded plan/apply: dry-run default, backup before overwrite, no live-instance write | `launchable.test.ts` — AC-5 | done |
| T-0024-08 | Dual-audience rendering: steps, verdicts, limitations, expert detail | `render` covered in `launchable.test.ts` — AC-7 | done |
| T-0024-09 | Prism metadata adapter over `meta.prismlauncher.org`, injected `fetch`, fixtures, no network in CI | `prism-meta.test.ts` | done |
| T-0024-10 | CLI `launchable` command wired through the spec 0023 distribution gate; help text | `launchable.test.ts` (cli) — AC-8 | done |
| T-0024-11 | Document the launcher facts in `DOMAIN-KNOWLEDGE` §8 with sources; sync the doc maps, spec index and ADR index | docs diff | done |
| T-0024-12 | Exercise the real flow end to end (resolve → build → install → launchable, real network, real files) and record the evidence | `scripts/launchable-e2e.mjs` | done |
