# Support

This is an alpha project maintained by one person in their spare time. Here is where to go and
what to expect.

## Where to go

| You want to… | Go to |
| --- | --- |
| Ask how to use something, or whether an idea fits | **Discussions** |
| Report something broken | **Issues** → Bug report |
| Suggest a capability | **Issues** → Feature request |
| Report a security flaw | **[`SECURITY.md`](./SECURITY.md)** — privately, never a public issue |
| Understand how the project works before contributing | **[`CONTRIBUTING.md`](./CONTRIBUTING.md)** |

Before opening an issue, run `npm run cli -- doctor`. It is read-only, it checks your
environment, and its output answers half the questions a bug report would otherwise need a round
trip for.

## What to expect

**Best effort, no service level agreement.** Realistically: a first response within a week or
two, faster for anything that corrupts or deletes user data — that class jumps the queue,
because the project's first promise is that your worlds and configs are safe.

**Fixes land on `main`.** There are no backports and no patch releases for older versions; the
supported version is the current one.

**A feature request may be answered with a spec instead of code.** The project's workflow
requires a specification before implementation, so agreeing that something should exist is a
real step, not a deflection.

## What is supported

- **The CLI** on **Windows, macOS and Linux** with **Node.js ≥ 22.18**. This is the primary,
  stable surface and gets the most attention.
- **The desktop app** on **Windows x64**, as an **alpha**. Twelve of the fourteen capabilities
  have a real screen; Discover and Assistant have none and point you at the CLI. Bug reports
  are welcome, but "Discover and Assistant are not built yet" is expected rather than a defect.
- **Modrinth** as the mod source. It is the only implemented catalog.

## What is not supported

- **CurseForge-only packs.** The provider interface exists; the adapter does not. Mods that live
  only on CurseForge will not resolve.
- **macOS and Linux desktop builds.** The Electron app is packaged for Windows only. The CLI
  works fine everywhere.
- **The published installer's signature.** The alpha build is unsigned; Windows will warn on
  first run. Verify the SHA-256 checksum published with the release.
- **Full Minecraft client bootstrap.** We never download the client, assets or natives and never
  hold your account token. `launchable` hands the pinned pack to **Prism Launcher** or the
  **Modrinth App**, which own that part, so one of them must already be installed. `launch`
  itself only runs the resolved JVM command with the pinned Java and heap.
- **Anything about a specific mod's behaviour.** The tool resolves, installs and diagnoses; it
  does not maintain the mods. Ask the mod's author.
- **Older Node versions.** Below 22.18 the source does not run at all, and no compatibility
  layer is planned.

## Filing a bug that gets fixed quickly

Include the version or commit, your OS, your Node version (`node --version`), the loader and
Minecraft version you targeted, **the exact command you ran**, what you expected, what happened,
and the relevant output. The bug-report template asks for exactly this.

If the tool crashed while working on an instance, say whether the instance was modified — the
answer tells the maintainer whether a safety guarantee failed, which changes the priority.
