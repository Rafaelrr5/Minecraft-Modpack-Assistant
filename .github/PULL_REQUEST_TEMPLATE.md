<!--
Thanks for the pull request. The sections below are what review will actually look at.
Delete anything that genuinely does not apply — but say so rather than leaving it blank.
-->

## What and why

<!-- What changes, and what problem it solves. The "why" is the part the diff cannot show. -->

Closes #

## Spec

<!--
This project specifies capabilities before implementing them (no capability without a spec).
- New capability?  Link the spec under specs/NNNN-*/ and confirm its Constitution Gate is filled in.
- Bug fix, refactor, docs, CI?  Say "not a new capability" — no spec needed.
-->

- Spec: `specs/____/spec.md`, or: not a new capability.

## Verification

Paste the real output, not a claim that it passed.

```
npm run check
```

<!-- If you touched anything under src/desktop/, all three of these too: -->

```
npm run desktop:typecheck
npm run desktop:build
npm run desktop:smoke
```

## Tests

- [ ] Behaviour changed → a test covers it.
- [ ] Bug fixed → the test **failed before the fix** (say so, and how you confirmed it).
- [ ] External API touched → a contract test against a recorded fixture.
- [ ] Generated artifact touched → it is asserted to parse back, not just byte-compared.
- [ ] No behaviour change (docs, CI, refactor with existing coverage).

## Safety

Only if this touches a path that writes to a user's Minecraft instance:

- [ ] Dry run is still the default; applying needs an explicit flag.
- [ ] A backup is taken before the write.
- [ ] Nothing can be written outside the instance root.
- [ ] Generated content is validated before it is written.
- [ ] Not applicable — this change writes nothing to a user instance.

## Docs in the same change

- [ ] Added or removed a file → the doc maps in `README.md` **and** `CLAUDE.md` are updated.
- [ ] New durable domain fact → it is in `docs/DOMAIN-KNOWLEDGE.md`, with a source.
- [ ] Significant decision → an ADR under `docs/decisions/`.
- [ ] Spec, plan, task or roadmap status updated to match reality.
- [ ] User-visible change → `CHANGELOG.md` under `Unreleased`.
- [ ] None of the above applies.

## Anything a reviewer should know

<!-- Trade-offs, things you deliberately left out, parts you are unsure about. -->
