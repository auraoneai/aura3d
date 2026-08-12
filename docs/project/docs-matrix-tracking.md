# Aura3D 2.0 Markdown audit ledger

Status: active release gate
Last audited: 2026-08-11

The repository-wide Markdown audit is produced by:

```bash
pnpm check:markdown-2.0
```

During completion work only, the still-active final checklist may be admitted
with `A3D_ALLOW_ACTIVE_FINAL_PRD=1`. The release command runs without that
exception and therefore requires the checklist itself to be consolidated into
current release evidence and removed before publication.

## Retention policy

Every retained Markdown file is classified as one of:

- current 2.0 documentation;
- agent or repository instruction;
- colocated package/app/example/template/fixture README;
- ADR;
- legal/license text;
- frozen benchmark context or an executable benchmark input/result;
- current production-evidence index;
- release document.

The audit fails for archive Markdown, the former project-planning directory,
PRD filenames,
the retired 1.6 handoff/migration/architecture paths, obsolete per-version
release-note paths, known superseded-document references, or broken relative
Markdown links. Its JSON output inventories every reviewed file with byte and
line counts, classification, relative-link count, and any broken links.

## Consolidation destinations

| Retired material | Current 2.0 destination |
| --- | --- |
| 1.6 architecture decision and layer snapshot | `docs/architecture/2.0-platform.md`, package ownership, and ADRs |
| 1.6 replatform and game-engine PRDs | 2.0 architecture, API, rendering, game-runtime, comparison, status, and release docs |
| recovery/remediation/remaining-work PRDs | current status, known limits, requirements trace, verification evidence, and release checklist |
| scratch/archive prompts and archive READMEs | removed; Git history is the archive |
| old migration drafts | `MIGRATION-2.0.md` |
| old release-note files | `CHANGELOG.md`; only the 2.0 release notes remain separate |
| old package/API plans | package ownership and `docs/architecture/public-api-design.md` |
| old Three.js plan | current comparison inventory, parity matrix, scope decisions, capability lineage, and status |
| Aura Clash showcase plan | `docs/examples/aura-clash.md`, app README, and generated launch evidence |

## Required companion gates

Markdown inventory is structural, not semantic proof. The release also runs:

- `pnpm verify:docs-version`
- `pnpm verify:api-docs`
- `pnpm check:agent-docs`
- `pnpm check:docs-codeblocks`
- `pnpm verify:claims`
- `pnpm check:claim-lineage`
- `pnpm check:docs-site`
- `pnpm check:marketing-truth`
- `pnpm check:marketing-links`

Generated evidence and frozen benchmark context never broaden a public claim.
Any retained 1.x version mentioned in migration, changelog, ADR, or benchmark
history is explicitly historical and cannot be an install instruction.
