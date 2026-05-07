# Release Checklist

Version: 0.1.0-alpha.0

Use this checklist before tagging any Galileo3D release candidate.

## Preflight

- Confirm the package version matches `CHANGELOG.md`, `docs/release-process.md`, `docs/compatibility.md`, and `docs/release-artifacts.json`.
- Confirm the worktree state is intentional.
- Confirm public claims match `docs/v2/claim-registry.md`.
- Confirm known limits are current in `docs/known-limits.md`.

## Verification

Run:

```sh
pnpm verify:claims
pnpm verify:docs-version
pnpm verify:release
pnpm verify:release:repeat
```

The release is blocked if:

- a final report is missing;
- a final report has a stale release-run ID;
- `tests/reports/clean-checkout.json` has `ok: false`, `git.dirty: true`, or missing clean-checkout reproduction fields;
- `tests/reports/release-repeat.json` does not prove rows 81 and 686 in `hardGateRows`;
- a public claim is unregistered;
- the changelog, support, security, contribution, migration, compatibility, and claim guideline docs do not reference the same package version.
- the package version or release artifacts are missing and the release notes imply a versioned public package release.

## Release Notes

- Summarize user-visible changes.
- List breaking changes and migration notes.
- Link generated reports by path.
- Keep unsupported behavior in known-limits docs rather than implying support.
