# GU47 lane eb: WP-2 (E-B) runtime light, environment, fog; multi-caster shadows

- Branch: `gu47/eb` (worktree `/Users/gurbakshchahal/platforms/aura3d-gu47/eb`)
- Base commit: `f797808be`
- Wave: 1 (phase 1, code). Nothing was run in a browser, remotely or on a GPU.
- Scope: `briefs/scope-eb.md`; PRD contract lines 157-178, WP lines 389-396, PRD §4.1 E-B row.

## Rows

| ID | Pri | Status | Commit | Notes / evidence |
|---|---|---|---|---|
| E-B.0 predecessor contract | M | done | `c95d4a170` | Predecessor's uncommitted `contracts/lighting.ts` reviewed and kept (diagnostics fields, `AuraEnvironmentSwapOptions`, `setEnvironment`, stub); doc of `localShadowLights` corrected (rows are `local-<i>`), `intensity` defined as the environment-term scale. |
| E-B.5 lighting diagnostics | M | done | `c95d4a170` | `punctualLights` / `localShadowLights` counted from the frame's collected lights (`runtimeLightStats`, `lights.ts`); `diagnostics().lighting` also carries `shadows`, `punctualLights`, `localShadowLights`. |
| E-B.1 setLight + per-frame light follow | M | done | `5f9efcb6c` | Lights follow `setPosition` / `setVisible` every frame; `handle.setLight` blends. `tests/unit/lighting/set-light.test.ts` (15). |
| E-B.2 setEnvironment + rotation | M | done (renderer consumption handed off) | `60ec60747` | Swap + crossfade + rotation on the source as `environmentProbeRotation`; `renderer/Background.ts` must apply it (handoff, no GU47 owner). `tests/unit/gu47/eb/set-environment.test.ts` (9). |
| E-B.3 setFog on effects.fog scenes | M | done | `a5b0e892f` | `overrideSceneFog`; `handle.setFog` writes its node; binding without VFX_SKY. `tests/unit/gu47/eb/set-fog.test.ts` (9). |
| E-B.4 multi-caster shadows | M | in progress | - | |
| E-B.6 declarations for E-H / E-G | M | done | `5f9efcb6c`, `a5b0e892f` | `part?` on the handle; typed sky `stars` / `clouds`. |
| E-B.7 tests + receipt spec | M | in progress | - | |

## Verification (base)

Base suites (23 files, 189 tests) pass on `f797808be` with the predecessor's file removed: prd02 lighting/shadow/environment suites, C-36 compiler, external-parity IBL, scene-contract g1n1m2, prd07 fog-live / fog-compile / C-21 / bench-lane-flags / registration / transient-light-pool.
