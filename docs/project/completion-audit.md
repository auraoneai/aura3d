# Release completion verification

This page is the retained completion record consumed by production-runtime and
Three.js-compat verification tools. It describes how to verify a 2.0 release
candidate against current source and generated evidence. It is not a feature
todo list and it is not a substitute for the operational checklist.

## How to verify

Use the current documents and commands, not a historical “still open” snapshot:

1. Read [`status/current-state.md`](./status/current-state.md) for what the
   public root API can prove today.
2. Read [`status/known-limits.md`](./status/known-limits.md) before writing
   release copy.
3. Follow [`release/release-checklist.md`](./release/release-checklist.md) for
   the operational release sequence.
4. Collect evidence with [`verification-evidence.md`](./verification-evidence.md)
   and the requirements-trace gate.

```bash
pnpm check:markdown-2.0
pnpm check:docs-codeblocks
pnpm check:agent-docs
pnpm verify:release:quick
```

Package publication, showcase promotion, marketing copy, and benchmark
comparison are separate release tracks. A green unit suite is not completion of
the public release sequence.

## What this record covers

- Claim labels and evidence paths in [`claim-guidelines.md`](./claim-guidelines.md)
- Release tracks in [`release-tracks.md`](./release-tracks.md)
- Showcase classification in [`showcase/apps-classification.md`](./showcase/apps-classification.md)
- Production-runtime backend selection (not full renderer parity) in
  [`architecture/create-aura-app-production-bridge.md`](./architecture/create-aura-app-production-bridge.md)

## What this record does not cover

Do not treat this page as:

- independent human visual sign-off
- package provenance or registry publication
- hosted production-origin verification
- a GO / NO-GO for a specific commit (that lives on generated reports)

Human review, serial clean-commit suites, tarball provenance, and live
deployment checks remain on the release checklist. This file exists so
verification tools have a stable, current completion document.
