# Contributing

Thanks for looking at this. This project has an unusual working contract, and reading this
page first will save you a rejected pull request.

The short version: **no capability lands without a spec**, and **`npm run check` is the gate**.

---

## Prerequisites

| | |
| --- | --- |
| **Node.js** | **≥ 22.18.0** — required, not a suggestion |
| **npm** | 10 or 11 (both are exercised) |
| **Git** | any recent version |

The version floor is not arbitrary. The source is TypeScript that runs *directly* on Node via
native type stripping — there is no build step between editing a file and running the CLI. That
requires 22.18, and it is why the source uses `.ts` import extensions (rewritten to `.js` when
`tsc` emits `dist/`) and erasable-only syntax: no `enum`, no parameter properties.

## Set up

```bash
git clone https://github.com/Rafaelrr5/Minecraft-Modpack-Assistant.git
cd Minecraft-Modpack-Assistant
npm ci
```

Use `npm ci`, not `npm install`. The lockfile is resolved with strict peer dependencies
(`.npmrc` sets `legacy-peer-deps=false`), and `npm install` on a machine with a different global
npm configuration will quietly produce a different tree than CI has.

No external service or API key is needed to develop. The Modrinth adapter is exercised against
recorded fixtures, and the tests never reach the network.

## Verify before you push

One command runs everything CI runs for the library and CLI:

```bash
npm run check
```

It is `typecheck` → `lint` → `build` → `test`, in that order. The lint step includes an
architecture rule (`src/architecture.test.ts` backs it up as a test) that fails the build if
anything in `src/core/` imports from `src/cli/` or `src/integration/` — the core must stay
usable by a future web UI, so the boundary is enforced mechanically rather than by review.

The desktop app has its own toolchain and is deliberately **outside** `npm run check`:

```bash
npm run desktop:typecheck   # typecheck the Electron shell
npm run desktop:build       # bundle main + preload + renderer into out/
npm run desktop:smoke       # build, launch the real app, assert the preload bridge is live
```

If you touched anything under `src/desktop/`, run all three. `desktop:smoke` is the one that
catches what a green build cannot: it starts the built application under Electron and asserts
the renderer really can reach the core through the preload bridge, and really cannot reach
`require`, `process` or `ipcRenderer`. CI runs the same three steps.

Running the CLI while you work:

```bash
npm run cli -- doctor      # read-only environment check
npm run cli -- --help      # every command
```

## The workflow: Spec-Driven Development

This is the part that differs most from a typical repository. The full contract is in
[`CLAUDE.md`](./CLAUDE.md) (written for anyone doing the work, human or AI agent), and the rules
it enforces come from [`memory/constitution.md`](./memory/constitution.md).

```
Constitution → Spec (what & why) → Plan (how) → Tasks → Implement → Verify
```

**Before writing feature code**, find the capability's spec under `specs/NNNN-*/`. If it does
not exist, author one first — `spec.md`, then `plan.md`, then `tasks.md`, from the
[templates](./templates/) — and agree it before implementing. A working feature with no spec is
a constitution violation and will be asked to go back a step.

Every spec ends with a **Constitution Gate**: a table checking the feature against all nine
principles, each marked Pass, N/A, or *justified* deviation. An unjustified failure blocks the
spec. Fill it in honestly; "N/A" for a principle that genuinely does not apply is a fine answer,
and a documented deviation with a reason is far better than a quiet Pass.

The principles you will run into most:

- **P2 — the core stays UI-agnostic.** Domain logic never imports a CLI or GUI concern.
- **P3 — validate, do not assume.** Anything generated (FTB Quests SNBT, KubeJS, `.mrpack` and
  CurseForge manifests, packwiz files) must parse and validate *before* it is written. SNBT
  comes from a real serializer; never string concatenation or regex.
- **P4 — the user's game instance is sacred.** Never mutate it without a backup first and an
  explicit confirmation. Operations are dry-run by default.
- **P5 — cite domain facts.** Claims about loaders, versions, APIs or file formats trace to
  [`docs/DOMAIN-KNOWLEDGE.md`](./docs/DOMAIN-KNOWLEDGE.md), which is itself source-cited. Flag
  uncertainty; do not fill it in.

Docs are kept in sync **in the same change**, not later. If you add or remove a file, update the
documentation maps in both [`README.md`](./README.md) and [`CLAUDE.md`](./CLAUDE.md); if you add
a durable domain fact, it goes in `docs/DOMAIN-KNOWLEDGE.md` with a source; if you make a
significant decision, write an ADR under [`docs/decisions/`](./docs/decisions/README.md).

## Tests

Tests live beside the code as `*.test.ts` and run on Node's built-in test runner — no Jest, no
Vitest, no configuration file.

```bash
npm test                          # everything
node --test src/core/build/       # one area
```

What the project expects of a test:

- A bug fix arrives with a test that **fails before the fix**. Write it, watch it fail, then
  fix. A test that passes against the unfixed code proves nothing.
- Anything touching an external API gets a **contract test** against a recorded fixture, so an
  upstream change is caught rather than silently absorbed.
- Anything that generates an artifact asserts it **parses back**, not just that the bytes match
  a snapshot.

## Commits and pull requests

Commits follow Conventional Commits — `feat(scope):`, `fix(scope):`, `docs(scope):`,
`chore(scope):`, `ci(scope):` — with a subject in the imperative mood. The body is the valuable
part: say what was wrong and why the change is the right shape, not what the diff already shows.

For the pull request, the template will ask for it, but in short: link the spec or issue, paste
the output of the gates you ran, and if you touched a write path say how you proved the
dry-run/backup/consent contract still holds.

Two things that will be sent back without further review: a capability with no spec, and a
change to behaviour with no test.

## Good first contributions

- A **CurseForge `ModSourceProvider`** — the interface exists and is deliberately
  provider-agnostic; only the Modrinth adapter is implemented.
- More entries in the **known-bad mod-combination** table used by the conflict pre-flight.
- Additional recorded **contract-test fixtures** for the Modrinth adapter.
- One of the **desktop screens** listed in [spec 0022](./specs/0022-desktop-app/spec.md) —
  thirteen of fourteen lifecycle capabilities still show a placeholder in the GUI, and each one
  follows the implemented Build screen's preview → confirm pattern.

## Reporting a security issue

Do not open a public issue. See [`SECURITY.md`](./SECURITY.md).
