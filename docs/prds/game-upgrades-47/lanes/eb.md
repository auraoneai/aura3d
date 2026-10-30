# GU47 lane eb: WP-2 (E-B) runtime light, environment, fog; multi-caster shadows

- Branch: `gu47/eb` (worktree `/Users/gurbakshchahal/platforms/aura3d-gu47/eb`)
- Base commit: `f797808be`
- Wave: 1 (phase 1, code). Nothing was run in a browser, remotely or on a GPU.
- Scope: `briefs/scope-eb.md`; PRD contract lines 157-178, WP lines 389-396, PRD §4.1 E-B row.

## Rows

| ID | Pri | Status | Commit | Notes / evidence |
|---|---|---|---|---|
| E-B.0 predecessor contract | M | done | (this commit) | Predecessor's uncommitted `contracts/lighting.ts` reviewed and kept (diagnostics fields, `AuraEnvironmentSwapOptions`, `setEnvironment`, stub); doc of `localShadowLights` corrected (rows are `local-<i>`), `intensity` defined as the environment-term scale. |
| E-B.5 lighting diagnostics | M | done | (this commit) | `punctualLights` / `localShadowLights` counted from the frame's collected lights (`runtimeLightStats`, `lights.ts`); `diagnostics().lighting` also carries `shadows`, `punctualLights`, `localShadowLights`. |
| E-B.1 setLight + per-frame light follow | M | in progress | - | |
| E-B.2 setEnvironment + rotation | M | pending | - | |
| E-B.3 setFog on effects.fog scenes | M | pending | - | |
| E-B.4 multi-caster shadows | M | pending | - | |
| E-B.6 declarations for E-H / E-G | M | pending | - | |
| E-B.7 tests + receipt spec | M | pending | - | |

## Verification (base)

Base suites (23 files, 189 tests) pass on `f797808be` with the predecessor's file removed: prd02 lighting/shadow/environment suites, C-36 compiler, external-parity IBL, scene-contract g1n1m2, prd07 fog-live / fog-compile / C-21 / bench-lane-flags / registration / transient-light-pool.
