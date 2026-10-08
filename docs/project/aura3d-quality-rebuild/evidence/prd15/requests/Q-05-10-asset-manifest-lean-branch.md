# Q-05-10 → to:prd05 (qr-request, CONTRACTS §6.5)

**Files:** `packages/aura3d-cli/src/asset-manifest.ts` (05-owned),
`tests/unit/aura3d-cli/assets.test.ts` (05-owned — fixture expectations)
**Contract served:** PRD-15 T8.1 — `@aura3d/lean` is removed in 4.0.0. The CLI
still detects a lean dependency and emits lean specifiers in generated
`aura-assets.ts`.

## Requested change

`resolveTypedAssetApi` (~line 121) currently returns `"@aura3d/lean" |
"@aura3d/engine"` by probing `manifest.dependencies`/`devDependencies` for
`@aura3d/lean`. In a 4.0.0 world the lean package cannot be installed, so the
branch is dead code that can only be reached by a pre-4.0 manifest — which is
exactly what the `migrate-2.0` codemod rewrites anyway.

Simplify: always return `"@aura3d/engine"` (or drop the helper and inline the
constant), and update `tests/unit/aura3d-cli/assets.test.ts` fixtures that
assert `from "@aura3d/lean"` output (lines ~14, 21, 29, 46).

## rg -l output

```
packages/aura3d-cli/src/asset-manifest.ts   (05-owned — this request)
tests/unit/aura3d-cli/assets.test.ts        (05-owned — fixture strings)
```

## Until merged

The lean branch is unreachable for new projects (lean is unpublished and
unresolvable at 4.0.0) and harmless for legacy manifests — the codemod rewrites
them. No 15-owned code depends on the branch.
