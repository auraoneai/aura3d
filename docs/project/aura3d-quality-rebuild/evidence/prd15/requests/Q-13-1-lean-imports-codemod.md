# Q-13-1 — run `lean-imports` on the lean templates + add mini-game lighting (PRD-15 §6.7, R20)

**Owner:** 13 (templates + create-aura3d scaffolds) · **Requester:** 15 · **SLA:** 2 working days
**Blocking:** §16.3 template captures on the real templates (this lane's standalone proof on
`tests/qr/prd15/fixtures/lean-templates/` already lands with T4.7 — you do NOT need to wait for us).

## What changed upstream

PRD-15 T4.6 collapsed `@aura3d/lean` to the §7.5 deprecated re-export shims.
`@aura3d/lean`, `/product` and `/game` still resolve every name the templates
use, but emit a one-time deprecation warning and are removed in 4.0.0.

## Requested change

Run the `lean-imports` codemod (C-39, shipped by this lane) on the eight files
that import `@aura3d/lean*`:

```
aura3d codemod lean-imports "templates/{product-viewer,mini-game}/src/*.ts" --write
aura3d codemod lean-imports "packages/create-aura3d/templates/{product-viewer,mini-game}/src/*.ts" --write
```

Affected files (8; the PRD task text says 16 — that count predates the
codemod's binding-level granularity; only `src/*.ts` carries lean imports):

- `templates/product-viewer/src/{main,aura-assets}.ts`
- `templates/mini-game/src/{main,aura-assets}.ts`
- `packages/create-aura3d/templates/product-viewer/src/{main,aura-assets}.ts`
- `packages/create-aura3d/templates/mini-game/src/{main,aura-assets}.ts`

Then **edit each template's `package.json`**: replace the
`"@aura3d/lean": "3.0.1"` dependency with `"@aura3d/engine": "3.0.1"` —
the codemod rewrites imports, not manifests.

## Mini-game lighting (§6.7)

The mini-game scene makes no light calls today. After migration it gains:

- a directional key light (`lights.directional({ shadow: true })`),
- an environment (`environments.studio()` or equivalent), and
- a shadow-receiving ground plane under the level.

The reference implementation is this lane's fixture copy at
`tests/qr/prd15/fixtures/lean-templates/minigame/src/main.ts` — copy the three
`.add(...)` lines verbatim (key light, `environments.studio()`, ground plane).

## Codemod report

Full report: `Q-13-1-lean-imports-report.json` (38 rows over 8 files).

| Mapping | Count | Meaning |
|---|---|---|
| exact | 34 | name exported unchanged by `@aura3d/engine` |
| approximate | 4 | renamed binding applied as alias: `AuraLeanNodeBuilder` → `AuraNodeBuilder as AuraLeanNodeBuilder`, `LeanPlatformerEvent` → `GamePlatformerEvent as LeanPlatformerEvent` (×2 files) |
| none | 0 | no lean-only APIs are referenced — the migration is fully mechanical |

## Acceptance

- `rg -l "@aura3d/lean" templates packages/create-aura3d` → 0
- both templates' `package.json` depend on `@aura3d/engine` (not lean)
- mini-game renders a key light + environment + shadow ground
- `pack:check` green on both templates (the qr-prd15-pack-check lane already
  covers them)
- update `tests/unit/agent-api/line-count-acceptance.test.ts` in the same
  change — it currently asserts `from "@aura3d/lean/product"` in the template
  source and will fail the moment the migration lands
