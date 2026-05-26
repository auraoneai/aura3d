# Release Checklist

Version: 1.0.0

Use this checklist before publishing package, docs, or demo claims.

## Required Checks

- [ ] `pnpm install` has been run for the current lockfile.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm test:unit` passes.
- [ ] `pnpm test:integration` passes when integration behavior changed.
- [ ] `pnpm test:browser` passes when browser routes changed.
- [ ] `pnpm build` passes.
- [ ] `pnpm verify:api-docs -- --write` has been run after export changes.
- [ ] `pnpm threejs-parity` has been run before Three.js parity claims.
- [ ] `pnpm superiority` has been run before measured Three.js superiority claims.
- [ ] `docs/project/threejs-superiority-status.md` matches the generated report state.
- [ ] Public claims follow `docs/project/claim-guidelines.md`.

## Docs Checks

- [ ] No docs reference deleted milestone files.
- [ ] Report paths use `tests/reports/threejs-parity/` for current Three.js parity reports.
- [ ] Versioned governance docs reference `Version: 1.0.0`.
- [ ] Links in `docs/project/site-map.md` resolve.

## Release Boundary

Do not ship public wording that says the full Three.js superiority gate passes unless the current generated superiority audit report passes.
Release wording and public-claim boundaries are governed by `docs/project/product-studio-claim-registry.md`.
