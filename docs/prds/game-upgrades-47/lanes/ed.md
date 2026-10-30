# Lane E-D (WP-4): materials and custom-shader access

- Branch: `gu47/ed` (worktree `/Users/gurbakshchahal/platforms/aura3d-gu47/ed`)
- Base commit: `f797808be` (gu47/integration = main 4.6.1 + swarm plan)
- Wave: 1 (phase 1, code). No browsers, no remote runs, no captures.
- Status: in progress. Contract types committed first (see Rows, ED-T).

## Rows

| ID | Pri | Status | Commit | Notes / evidence |
|---|---|---|---|---|
| ED-T | M | done | (types commit) | Contract types: `AuraMaterialSpec.rim`, `AuraMaterialSpec.bloom` (E-C contract), `AuraMaterialRimSpec`, `AuraInstanceColorTarget`, `AuraPrimitiveNode/AuraModelNode.instanceColorTarget`, `AuraCustomMaterialSpec.castShadow`, `AuraDiagnostics.triangles/textureBytes`, `AuraModelMaterialOverride.rim/transmission/iridescence`. |
| ED-1 | M | in progress | | PBR rim term + override field; receipt spec `material-rim`. |
| ED-2 | M | pending | | `material.toon`. |
| ED-3 | M | pending | | `a3d_ibl`, `a3d_lights`, built-in sun/hemi/fog uniforms, `fog: true`. |
| ED-4 | M | pending | | `castShadow` for `material.custom` (author vertex shader in the depth pass). |
| ED-5 | M | pending | | Per-instance emissive target; per-instance matrix/colour for instanced `material.custom`. |
| ED-6 | M | pending | | `setEmissive`; `transmission`/`iridescence` override fields. |
| ED-7 | M | pending | | `triangles`, `textureBytes` in `app.diagnostics()`. |
| ED-8 | M | pending | | Unit tests; shader-compile suites of all ports. |

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
