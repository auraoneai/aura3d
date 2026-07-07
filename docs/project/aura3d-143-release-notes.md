# Aura3D 1.4.3 Release Notes

Aura3D 1.4.3 is an npm search-snippet correction on top of the 1.4.2
developer-positioning release.

## What Changed

- Updated the published `create-aura3d` package description so npm search and
  package cards lead with the one-command app creation story.
- Updated the published `@aura3d/cli` package description so npm search and
  package cards lead with real GLB/glTF asset acquisition, typed references,
  provenance, validation, screenshots, and deploy checks.
- Kept the refreshed root, scaffolder, and CLI README content from 1.4.2.
- Updated package and template versions to `1.4.3` so npm `latest` points at
  the corrected metadata everywhere.

## Claim Boundary

This release does not introduce new renderer, WebGPU, PBR, postprocess,
skinning, morph-target, game-kit, or production-runtime capabilities. It is an
npm metadata and scaffold-version patch for developer discovery.

## Verification

```bash
pnpm verify:api-docs -- --write
pnpm check:agent-docs
pnpm typecheck:raw
pnpm exec vitest run tests/unit/create-aura3d/templates.test.ts --reporter=dot
pnpm verify:package-install-smoke:fresh
pnpm verify:versioned-release
pnpm verify:package-provenance
node tools/release/publish-all.mjs --dry-run
```
