# Aura3D 1.4.1 Release Notes

Aura3D 1.4.1 is a package-presentation and npm discoverability patch for the
26 public Aura3D packages.

## What Changed

- Added npm-rendered READMEs for package pages that were blank on npm:
  `@aura3d/apps`, `@aura3d/asset-index`, `@aura3d/controls`,
  `@aura3d/environments`, `@aura3d/materials`, `@aura3d/product-studio`,
  `@aura3d/react`, `@aura3d/three-compat`, and `@aura3d/workflows`.
- Added npm-rendered READMEs for `@aura3d/cli` and `create-aura3d`, the two
  main discovery surfaces for asset workflows and project scaffolding.
- Filled package descriptions, homepage links, repository metadata, license,
  publish config, and search keywords across the public package family.
- Tightened published package payloads for package folders to ship `README.md`
  and `dist` instead of incidental source or local artifacts.
- Updated `create-aura3d` templates and the scaffolder default engine version
  to `@aura3d/engine@1.4.1`.

## Claim Boundary

This release does not introduce new renderer, WebGPU, PBR, postprocess,
skinning, morph-target, game-kit, or production-runtime capabilities. It is a
package metadata, README, scaffold-version, and npm presentation patch on top of
the 1.4.0 runtime baseline.

## Verification

Prepublish verification completed on July 7, 2026 from the local macOS
workspace on `main`:

```bash
pnpm typecheck:raw
pnpm build
pnpm verify:api-docs -- --write
pnpm check:agent-docs
pnpm exec vitest run tests/unit/create-aura3d/templates.test.ts --reporter=dot
pnpm exec vitest run tests/unit/aura3d-cli/assets.test.ts tests/unit/aura3d-cli/deployment.test.ts tests/unit/aura3d-cli/animation-asset-validator.test.ts --reporter=dot
pnpm verify:package-install-smoke:fresh
pnpm verify:versioned-release
pnpm verify:package-provenance
node tools/release/publish-all.mjs --dry-run
```

Additional local release audits passed:

- all 26 publishable package manifests are `1.4.1`, include npm-rendered
  `README.md`, and carry package metadata;
- every source `create-aura3d` template pins Aura3D dependencies to `1.4.1`;
- all 26 `tools/release/publish-all.mjs --dry-run` tarballs include
  `package/README.md`, `package/package.json@1.4.1`, and no local artifact
  directories such as `node_modules`, `.omo`, coverage, Playwright reports,
  lockfiles, `.npmrc`, or `.env`.

Publish command:

```bash
node tools/release/publish-all.mjs
```

`npm whoami` was verified locally before publish. Npm auth material must remain
outside committed source and must not be printed in logs.
