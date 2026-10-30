# Lane E-D (WP-4): materials and custom-shader access

- Branch: `gu47/ed` (worktree `/Users/gurbakshchahal/platforms/aura3d-gu47/ed`)
- Base commit: `f797808be` (gu47/integration = main 4.6.1 + swarm plan)
- Wave: 1 (phase 1, code). No browsers, no remote runs, no captures.
- Status: in progress. Contract types committed first (see Rows, ED-T).

## Rows

| ID | Pri | Status | Commit | Notes / evidence |
|---|---|---|---|---|
| ED-T | M | done | (types commit) | Contract types: `AuraMaterialSpec.rim`, `AuraMaterialSpec.bloom` (E-C contract), `AuraMaterialRimSpec`, `AuraInstanceColorTarget`, `AuraPrimitiveNode/AuraModelNode.instanceColorTarget`, `AuraCustomMaterialSpec.castShadow`, `AuraDiagnostics.triangles/textureBytes`, `AuraModelMaterialOverride.rim/transmission/iridescence`. |
| ED-1 | M | done | 7f9b90d82, 377e5c869 | Rim lowers onto the existing PRD-04 `prd04.rim` feature (`u_prd04RimColor/Power/Strength`); primitives via `applyNodeMaterialExtras` (renderInput), models/handles via `lowerModelMaterialOverrides`. `tests/unit/gu47/ed/material-rim.test.ts` (byte-identical programs without rim). Receipt spec `tests/browser/gu47/material-rim.spec.ts` (phase 2). |
| ED-2 | M | pending | | `material.toon`. |
| ED-3 | M | done | 4d140880f | `a3d_scene` (built-ins), `a3d_lights` (`a3dDirect`), `a3d_ibl` (`a3dEnvDiffuse/Specular`), `a3d_rim`; include-once expansion; `fog: true` wraps author main with `environment_fog_common`. `tests/unit/gu47/ed/custom-shader-chunks.test.ts`. |
| ED-4 | M | pending | | `castShadow` for `material.custom` (author vertex shader in the depth pass). |
| ED-5 | M | partial | 7f9b90d82, b91343b50 | `prd04.instanceColorTarget` feature + ForwardPass routing done; adapter `instanceMatrix`/`instanceColor` pending. |
| ED-6 | M | partial | 7f9b90d82 | `applyMaterialEmissive`, transmission/iridescence lowering done; handle `setEmissive` wiring + tests pending. |
| ED-7 | M | pending | | `triangles`, `textureBytes` in `app.diagnostics()`. |
| ED-8 | M | partial | 7f9b90d82 | `registerForwardDrawHook` in ForwardPass; test pending. |

## Contract (shipped names, PRD §3.1 E-D)

- `AuraMaterialSpec.rim?: { color: string; power?: number; intensity?: number }` (named `AuraMaterialRimSpec`).
- `AuraMaterialSpec.bloom?: number` (0..2, default 1; read by E-C).
- `AuraCustomMaterialSpec.castShadow?: boolean`.
- `AuraModelMaterialOverride.rim? / transmission? / iridescence?`.
- `AuraInstanceColorTarget = "base" | "emissive" | "both"`; node field `instanceColorTarget?` on `AuraPrimitiveNode` and `AuraModelNode` (E-G stamps it from `instances.*({ instanceColorTarget })`).
- `AuraDiagnostics.triangles?: number`, `AuraDiagnostics.textureBytes?: number`.

## Handoffs

| to lane | file:symbol | change | why |
|---|---|---|---|
| (filled as work proceeds) | | | |

## Decisions

(filled as work proceeds)

## CHANGELOG text for WP-38

(filled at the end)

## Phase-2 plan

(filled at the end)

## Verification

(filled at the end)
