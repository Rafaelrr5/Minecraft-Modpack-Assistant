# Architecture Decision Records (ADRs)

This folder = project's **durable memory of *why***. Each ADR capture one significant decision — context, options weighed, choice, consequences — so future contributors (human or agent) understand *why* project is way it is, and decisions revisited **deliberately** not drift silently.

Middle layer of project's three-layer memory:

1. **[`CLAUDE.md`](../../CLAUDE.md)** — *working memory*: compact, always-loaded list of confirmed decisions and key facts.
2. **ADRs (this folder)** — *the why*: rationale behind each decision.
3. **[`DOMAIN-KNOWLEDGE.md`](../DOMAIN-KNOWLEDGE.md)** — *the findings*: source-cited technical reference.

## How we use ADRs

- One decision per file, named `NNNN-kebab-title.md`, numbered in decision order.
- Use [`../../templates/adr-template.md`](../../templates/adr-template.md).
- ADRs **append-only in spirit**: not rewrite past decision — add new ADR that *supersedes* it, update old one's status. Preserve history of thinking.
- Significant decisions: change constitution, adopt/drop major dependency or provider, change core format, or anything surprise new contributor.

## Index

| ADR | Title | Status |
| --- | --- | --- |
| [0001](./0001-spec-driven-development.md) | Adopt Spec-Driven Development (SDD) | accepted |
| [0002](./0002-tech-stack-typescript-node.md) | Use TypeScript / Node.js as the single stack | accepted |
| [0003](./0003-cli-first-form-factor.md) | CLI-first form factor for the MVP | accepted |
| [0004](./0004-modrinth-first-data-source.md) | Modrinth as the first mod-catalog data source | accepted |
| [0005](./0005-packwiz-and-mrpack-pack-format.md) | packwiz (dev) + `.mrpack` (export) as pack formats | accepted |
| [0006](./0006-native-packwiz-io.md) | Native (in-process) packwiz I/O, no CLI shell-out | accepted |