# Saltwind Highway (`roadster-hours-port`): 5.0.1 upgrade guide

Source: plan section 5.22 of `docs/project/5.0-games-and-examples-upgrade-plan.md` (app `apps/showcase-roadster-hours-port`, racing). Lab flags and shared helpers: [README](./README.md). Stable features only by default; EXPERIMENTAL items stay behind lab flags (decision D1).

## Plan facts

- Legacy: **82 custom hits** (largest: `world.ts` 27, `materials.ts` 13, 13 `glsl:`, `art/post.ts` shaderPass), `scatterTransform` x5 + `scatter` x15, `geometry.dynamic` x10, vfx burst/trail, `pixelRatio` x6; Meshy sedan/bus assets with provenance (`assets/provenance/saltwind*Salt.meta.json`, touched in `ccdc9cfe7`).
- Effort and risk: S wave 1, L for A4. Visual risk: HIGH.

## Checklist

Shared (Wave 0)

- [x] `package.json` version set to 5.0.1 (W-1, cosmetic, D6)
- [x] `no-removed-5-0-apis` game check passes (W-2)
- [ ] Baseline drift capture compared with the 4.7.10 frames of record, static bands only (W-3, parent-owned single ACR capture; not claimed here. 5.0.2 base vs this branch, same view: `before.png` / `after.png` match apart from the animated sea)
- [x] `environments.neutral`/`capture` exposure resolved (W-4): game is in section C of [neutral-environment-exposure.md](./neutral-environment-exposure.md) (route HDRIs via `environments.hdri`; `preset` only on the no-row `?look=original` path), nothing to pin; `before.png`/`after.png` show no drift
- [ ] Catalog digests refreshed after any source edit: `node tools/agent-examples/refresh-catalog-digests.mjs` (W-5)

Adoption (5.0 adoption row)

- [ ] A8 per-slot custom shader on the vehicles (skipped: not applicable. Vehicles are baked CC0 groups (`cars.ts`, paint/trim/glass/head/tail) or Meshy meshes drawn through `batched.mesh` with one material per group, not imported GLB slots, so there is no slot to override)
- [ ] A12 scatter via root planner (skipped: the game's own seeded placement lists feed 3D (x,y,z) near/far hysteresis in `world.ts`; `splitScatterByDistance` is XZ-only banding with no hysteresis, so swapping it changes which instances flip LOD and re-uploads per frame. No visible gain)
- [ ] A4 portable materials (skipped: not one of the three designated pilots; the 82 GLSL hits stay, route is WebGL2-only for custom surfaces; `?backend=auto` RENDERER_MOUNT_FAILED recorded as engine issue)
- [x] A9 camera depth (EXPERIMENTAL, lab flag, default off): `?depth=reversed|logarithmic` now reaches `camera.perspective({ depth })` (`far: 7000` highway); real-GPU frame `after-depth-reversed.png` renders with no new console errors; default frame unchanged
- [x] A1 visible loading bar: `.aura3d-loading` bar under the existing status line driven by the shared helper (`before-loading.png` vs `after-loading.png`); no copy change
- [ ] A5 light probe grid / IES / projected spot / clustered / voxel GI (skipped: native WebGPU renderer only (`AdvancedLightingConsumer`), the game's surfaces are custom GLSL that cannot sample them, and D1 forbids EXPERIMENTAL as default)
- [ ] A6 post stack (verified, no change needed: custom `roadPass` + bloom/grain/flare/LUT render identically on 5.0.2; `after.png`; `normal` input not needed)
- [ ] A7 workers (skipped: custom GLSL scene built on `geometry.dynamic`; worker rendering is EXPERIMENTAL and has no proof for it), A13 KTX2, A14, A15, A16, A17, A11 (not applicable: no such assets/features in this game)
- [ ] A10 `?gamut=p3` (lab flag already wired; real-GPU frame `after-gamut-p3-mount-failed.png` shows RENDERER_MOUNT_FAILED: the post chain (bloom/LUT/grain/flare) cannot apply the P3 output policy; engine issue, stays off)

Verification

- [x] GC, UT (27 files / 316 tests pass with `--testTimeout=60000`; the default 5 s timeouts flake under machine load; typecheck clean; CAP is parent-owned and not claimed)
- [ ] provenance sidecars must stay hash-consistent (`asset-provenance`, `S5-WP07-01`)
- [x] `node tools/game-checks/run.mjs roadster-hours-port`: 0 errors, 2 warnings (stale card frame, open guide boxes)
- [x] Before/after frames attached: `evidence/game-upgrades-502/roadster-hours-port/{before,after}.png` (raw-CDP headless Chrome on Metal GPU, 960x540, 11 s settle, `?level=0&autostart=1&manual=1`; identical, no console errors beyond 404s)

5.0.2 stable adoption (wave 4): A1 shared loading helper wired in the app wrapper (`data-progress` on `#loading`, no visual change); W-8 lab flags `?backend=`/`?gamut=` wired, default OFF (`?backend=auto` currently fails with RENDERER_MOUNT_FAILED on WebGPU point depth for `plume-dust`: EXPERIMENTAL, recorded as engine issue). B2 partial AuraApp cast: none present in this game. A2 diagnostics: `?diag=1` already installed via `diag.ts`.


5.0.3: visible A1 progress bar and A9 `?depth=` wiring (see above). Real-GPU frames: headless Chrome on ANGLE Metal (Apple M4 Max), 960x540, 11.5 s settle, `?level=0&autostart=1&manual=1`, evidence in `evidence/game-upgrades-503/roadster-hours-port/`. Visible change for players: a thin progress bar while the route loads; the driving view is otherwise identical.
