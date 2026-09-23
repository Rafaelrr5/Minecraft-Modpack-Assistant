# Security Policy

## Supported versions

This project is **pre-1.0 alpha**. Only the current `main` branch is supported. There are no
backports: if a flaw is confirmed, the fix lands on `main` and the next release carries it.

| Version | Supported |
| --- | --- |
| `main` | ✅ |
| Anything older | ❌ |

## Reporting a vulnerability

**Do not open a public issue.**

1. **Preferred** — GitHub's private vulnerability reporting: open the repository's
   **Security** tab → **Report a vulnerability**. It creates a private advisory only you and
   the maintainer can see.
2. **Fallback** — email **faelrribeiro3@gmail.com** with `SECURITY` in the subject.

Please include: what you found, the version or commit, your operating system and Node version,
the smallest reproduction you have, and what an attacker gains.

**What to expect.** This is a single-maintainer project with no funding and no bug bounty, so
the honest commitment is small and real rather than large and aspirational:

- acknowledgement within **7 days**;
- an assessment (confirmed / not a vulnerability / out of scope) within **30 days**;
- for a confirmed issue, a fix on `main` and a public advisory crediting you unless you prefer
  otherwise.

Please give 90 days before public disclosure, or less by agreement if a fix ships sooner.

## Threat model

This is a **local-first command-line tool and desktop application**. It runs on your machine,
with your permissions, on files you point it at. There is no server, no account, no telemetry,
and nothing is uploaded anywhere unless you explicitly ask for it.

That shape decides what counts as a vulnerability.

### The trust boundaries that matter

**1. The instance root.** Every write to a Minecraft instance goes through a guarded
`InstanceFs` that refuses to write outside the instance directory you named — including via
symlinks and Windows junctions that point out of it. A path that escapes that root is a
vulnerability.

**2. Downloaded mod jars.** The installer fetches each pinned mod jar and verifies its hash
**before** writing it into `mods/`. A jar that reaches disk without hash verification, or a
verification that can be bypassed, is a vulnerability.

**3. Generated artifacts.** FTB Quests SNBT, KubeJS scripts, packwiz files and `.mrpack` /
CurseForge manifests are validated by parse-back before any write. Content that is written
without validation, or input that escapes its quoting into a generated script, is a
vulnerability.

**4. Your credentials.** Optional API keys (Modrinth, NVIDIA, Google) are read from the
environment only, never hard-coded and never committed. A key that appears in a log line, a
crash report, a generated artifact, or an outbound request to anywhere other than its own
provider is a vulnerability.

**5. Consent before mutation.** Operations are dry-run by default; applying takes an explicit
flag, and a backup is taken first. A path that mutates your instance without that sequence is a
vulnerability.

**6. The desktop renderer is untrusted.** The Electron GUI runs with context isolation on,
node integration off, and sandbox on; the renderer reaches the core only through a narrow,
validated preload bridge. A renderer escape — reaching `require`, `process`, `ipcRenderer`, or
an unvalidated IPC channel — is a vulnerability.

### In scope

- Escaping the guarded instance root (paths, symlinks, junctions, archive entries).
- Writing an unverified or hash-mismatched jar.
- Injection into generated SNBT, KubeJS, TOML or JSON that survives validation.
- Credential leakage into logs, artifacts, or network requests.
- Mutating a user instance without the dry-run → backup → confirm sequence.
- Renderer-to-main escapes in the desktop app, or IPC that accepts unvalidated input.
- Dependency vulnerabilities that are actually reachable from this code.

### Out of scope

- **Vulnerabilities in mods themselves.** The tool resolves and downloads third-party mods; it
  does not audit them. Report those to the mod author.
- **The unsigned desktop installer.** The alpha build is deliberately not code-signed — no
  certificate exists — so Windows SmartScreen warns on first run. This is a documented decision,
  not an oversight. Verify the published SHA-256 checksum instead. When signing is adopted,
  this line goes away.
- **Running an installer you did not verify.** Checking the checksum is your side of that
  contract.
- **Your own API keys** in your own `.env`, your shell history, or your terminal output.
- Anything requiring an attacker who already has code execution or file-write access as your
  user. At that point the tool is not the weakest link.
- Denial of service against your own machine (for example, pointing the tool at a pathological
  input to make it slow).
- Rate limits, availability or content of Modrinth, mclo.gs, or any LLM provider.

## What we do to keep this true

- `npm audit` is expected to report **zero** vulnerabilities, for runtime and build tooling
  alike; advisories are cleared rather than documented away.
- The core → adapter boundary is enforced by lint **and** by a test, so the deterministic core
  cannot quietly gain I/O.
- The desktop preload bridge is asserted at runtime by a smoke test in CI — a green build alone
  is not accepted as proof that isolation holds.
- Secrets are read from the environment only. `.env` is git-ignored;
  [`.env.example`](./.env.example) documents the variables and contains no values.
