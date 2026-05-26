# Verification Guide For Agents

Version: 1.0.0

Use the narrowest command that proves the change first, then run broader checks when the blast radius justifies it.

## Fast Baseline

```sh
pnpm typecheck
```

Run this for almost every TypeScript change. If a change only edits Markdown, use docs checks instead unless the docs change references code paths that need verification.

## Focused Unit And Integration Tests

```sh
pnpm exec vitest run tests/unit/<area> --reporter=dot
pnpm exec vitest run tests/integration/<file>.test.ts --reporter=dot
```

Use focused tests while iterating. Prefer adding a targeted unit test for package logic before relying on aggregate browser routes.

## Browser And Route Verification

Current local route surface:

```sh
pnpm exec playwright test tests/browser/current-routes-route-health.spec.ts --reporter=line
pnpm exec playwright test tests/browser/advanced-examples-gallery.spec.ts --reporter=line
pnpm exec playwright test tests/browser/wow-showcase-screenshots.spec.ts --reporter=line
```

Aggregate browser route command:

```sh
pnpm test:browser
```

Use route-health after changing root `index.html`, app route paths, current-route tools, registry wording, or route visibility. Use the advanced gallery or wow screenshot lanes for visual route changes.

## Advanced Gallery Evidence

Run this only when gallery source, route composition, renderer output, screenshots, metadata hashes, review code, or audit code change:

```sh
pnpm advanced-gallery:pipeline
```

The pipeline is intentionally heavier than route-health. It captures browser evidence, runs visual review, and audits the reusable-systems disclosure report.

## Docs Checks

```sh
pnpm verify:docs-version
pnpm verify:docs-consistency
```

Use these after editing docs links, versioned docs, tutorials, site-map entries, claim docs, or route documentation.

If public exports changed:

```sh
pnpm verify:api-docs
```

If `docs/api/public-api.md` is stale, regenerate with the repo's API docs tool path used by the script, then rerun the check.

## Package And Public Surface Checks

Use these when public entrypoints, package boundaries, shader sources, package exports, or import paths change:

```sh
pnpm verify:architecture
pnpm verify:boundaries
pnpm verify:exports
pnpm verify:imports
pnpm verify:shaders
pnpm verify:size
```

Use `pnpm build` before packaging, release work, template verification, or changes that affect generated `dist/`.

## Current Route Prune Guard

After route or app-directory changes, confirm the allowlist remains narrow:

```sh
pnpm exec tsx --tsconfig tsconfig.base.json tools/current-routes-legacy-prune/index.ts
```

Expected route dirs are the advanced gallery, `apps/wow-*`, and shared `apps/wow-common`.

## Claims And Evidence Lanes

Use these only when the user asks for parity, superiority, release-readiness, or public-proof work:

```sh
pnpm threejs-parity
pnpm superiority
```

These aggregate commands can be expensive. For focused work, prefer the matching package or tool lane from `package.json`.

## Templates

Template work usually needs:

```sh
pnpm test:templates
pnpm verify:templates
```

If a template imports public package subpaths, run package exports/API checks too.

## Final Sanity Checks

Before handing work back:

```sh
git diff --check
git status --short
```

Report commands that passed and commands that were not run. If a command fails because of pre-existing unrelated workspace state, name the failing command and the concrete failure rather than hiding it.

