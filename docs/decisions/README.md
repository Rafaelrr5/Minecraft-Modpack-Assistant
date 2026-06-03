# Architecture Decision Records (ADRs)

This folder is the project's **durable memory of *why***. Each ADR captures a single
significant decision — its context, the options weighed, the choice, and the consequences —
so that future contributors (human or agent) can understand *why* the project is the way it
is, and so decisions are revisited **deliberately** rather than drifting silently.

This is the middle layer of the project's three-layer memory:

1. **[`CLAUDE.md`](../../CLAUDE.md)** — *working memory*: the compact, always-loaded list of
   confirmed decisions and key facts.
2. **ADRs (this folder)** — *the why*: the rationale behind each decision.
3. **[`DOMAIN-KNOWLEDGE.md`](../DOMAIN-KNOWLEDGE.md)** — *the findings*: the source-cited
   technical reference.

## How we use ADRs

- One decision per file, named `NNNN-kebab-title.md`, numbered in order of decision.
- Use [`../../templates/adr-template.md`](../../templates/adr-template.md).
- ADRs are **append-only in spirit**: rather than rewriting a past decision, add a new ADR
  that *supersedes* it and update the old one's status. This preserves the history of
  thinking.
- Significant decisions include: changing the constitution, adopting/dropping a major
  dependency or provider, changing a core format, or anything that would surprise a new
  contributor.

## Index

| ADR | Title | Status |
| --- | --- | --- |
| [0001](./0001-spec-driven-development.md) | Adopt Spec-Driven Development (SDD) | accepted |
| [0002](./0002-tech-stack-typescript-node.md) | Use TypeScript / Node.js as the single stack | accepted |
| [0003](./0003-cli-first-form-factor.md) | CLI-first form factor for the MVP | accepted |
| [0004](./0004-modrinth-first-data-source.md) | Modrinth as the first mod-catalog data source | accepted |
| [0005](./0005-packwiz-and-mrpack-pack-format.md) | packwiz (dev) + `.mrpack` (export) as pack formats | accepted |
