# Duneglide (`silt-and-signal-port`): 5.0.1 upgrade guide

Source: plan section 5.24 of `docs/project/5.0-games-and-examples-upgrade-plan.md` (app `apps/showcase-silt-and-signal-port`, arcade). Lab flags and shared helpers: [README](./README.md). Stable features only by default; EXPERIMENTAL items stay behind lab flags (decision D1).

## Plan facts

- Legacy: 18 custom hits; `effects.toon` x3 (toon post), water (`water.half`, `water.level`), `createAnimationController` x3 (the only game using the 4.x animation controller directly), `main.ts:589-590` `pixelRatio: 1` + `renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" }` (hard-coded renderer option object, B4 validated-shape check: `fallback: "safe-basic"` + `mode` are not `backend`, still accepted per grep of `renderer.backend` rules; confirm in the examples-source report), `scatter*` x4 (manual).
- Effort and risk: S wave 1, M for A4 water. Visual risk: medium (toon + water + fog).

## Checklist

Shared (Wave 0)

- [x] `package.json` version set to 5.0.1 (W-1, cosmetic, D6)
- [x] `no-removed-5-0-apis` game check passes (W-2)
- [ ] Baseline drift capture compared with the 4.7.10 frames of record, static bands only (W-3, parent-owned single ACR capture)
- [ ] `environments.neutral`/`capture` exposure resolved (W-4, see [neutral-environment-exposure.md](./neutral-environment-exposure.md))
- [ ] Catalog digests refreshed after any source edit: `node tools/agent-examples/refresh-catalog-digests.mjs` (W-5)

Adoption (5.0 adoption row)

- [x] A1 (shared createLoadingProgress tracks the textured-material swap; lab flags ?backend/?gamut wired default-off via the shared parser; frames in evidence/game-upgrades-502/silt-and-signal-port/)
- [ ] A8 for the glider slots (skipped 5.0.3: hoverboard.glb has ONE PBR slot with three authored maps (base, normal, metal-rough); a custom shader replaces the engine PBR/IBL/CSM lighting for no visible gain, and a plain `rim` override would change the look identity)
- [ ] A7 worker lab (animation-controller heavy, but custom attributes make it fragile: skip) (skipped per plan, EXPERIMENTAL)
- [x] A4 for water: `examples/silt-and-signal-port/water-graph.ts` (paired GLSL+WGSL shader graph, default on, `?water=glsl` keeps the hand-written baseline). Real-GPU WebGL2 pixel diff vs GLSL on water pixels: inked mean 1.76/255 p99 5, original mean 0.44 p99 2 (`evidence/game-upgrades-503/silt-and-signal-port/{before,after}-water-{inked,original}.png`, `diff-water-inked-x4.png`); unit tests `tests/unit/silt-and-signal-port/water-graph.test.ts`. WebGPU run not done: sky and ring stay GLSL-only, so `?backend` is still WebGL2 for this game

Verification

- [ ] GC, UT, CAP
- [ ] `node tools/game-checks/run.mjs silt-and-signal-port` clean
- [ ] Before/after frames attached (static bands) with the capture command, per game, before the change ships
