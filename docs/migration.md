# Migration Notes

Version: 0.1.0-alpha.0

## Current Migration Status

Galileo3D version `0.1.0-alpha.0` is an internal rebuild version. There is not yet a public stable API with compatibility guarantees.

## Migration Policy

- Any public API rename, removed export, changed constructor contract, or changed runtime behavior must be listed in `CHANGELOG.md`.
- Breaking changes must include a migration note before a developer preview release.
- Migration docs must not imply production stability unless `docs/v2/claim-registry.md` permits that claim.

## Known Current Guidance

- Use package public exports instead of private source-file imports.
- Re-run `pnpm verify:exports` and `pnpm verify:imports` after package API changes.
- Re-run `pnpm verify:claims` after docs or release-note changes.
