# Aura3D 3.0.0 Release Notes

Version: 3.0.0

Status: published. K2 readiness `supersede` 14/14 at the release commit `c71aff6e`, tag `v3.0.0` pushed, all 29 packages live on npm at 3.0.0, K2 `supersede` 14/14 re-earned post-tag on the packaging-fix HEAD (see Provenance below). Deployed-site proof: see L6 (marketing).

Date: 2026-09-05

Aura3D 3.0.0 is the agent-era major: the public API surface and parity evidence accumulated since 2.0, coordinated across the root package and 28 public packages. The positioning is "the browser 3D engine for the agent era" (prompt it, prove it, ship it), with every capability claim bound to the evidence gate that proves it.

## What is in 3.0.0

- Root `createAuraApp` API surface added since 2.0: prompt→game and prompt→animation builders, game-feel triggers, follow/chase/platformer camera rigs, vehicle chassis + driver AI, GPU particles, SDF text, navmesh crowds, visual-scripting catalog, and a bounded editor surface — each labeled `createAuraApp`-proven only where root browser evidence exists.
- Rendering proofs: native fused LDR postprocess path, multi-mip bloom pyramid with quality presets, exact sRGB output encoding, anisotropic-GGX over authored tangents, cascaded directional shadows with PCF, GGX PMREM image-based lighting — with shader-reference vectors pinning the math against regressions.
- three.js comparison evidence stays in the repository-locked `three@0.185.1` head-to-head reports. No workload outside those reports supports a superiority sentence.
- Showcase routes are individually gated as before: machine-green is necessary but never sufficient — promotion waits on hash-bound independent human review of the exact final artifacts.
- The 2.0.4 Meshy CLI asset-pipeline patch, secret-scan, and provenance rules carry over unchanged.

## Claim boundary

This release does not establish that:

- Aura3D is universally better than three.js (comparison is per-workload, r185-locked, reported);
- any showcase route is public-ready without its recorded human approval;
- full PBR parity, HDR/IBL production pipelines, broad postprocess, broad skinned/morph coverage, reusable game kits, arbitrary-mesh collision, AI/netcode, or vehicle physics are proven at root beyond what `docs/project/status/known-limits.md` states;
- WebGPU feature rows beyond the proven legs, or any browser evidence not retained under `tests/reports/`, are proven.

## Install (after publish)

```sh
npx @aura3d/cli@3.0.0 --help
npm install @aura3d/engine@3.0.0
npx create-aura3d@3.0.0 my-product --template product-viewer
```

## Provenance

- K2 readiness `supersede` 14/14 at the release commit `c71aff6e` (`tests/reports/muse3jsparity/readiness.json`).
- Tag `v3.0.0` pushed; GitHub release published from this file.
- All 29 packages live on npm at 3.0.0 (`release-artifacts/3.0-npm-registry-verification.json`).
- Post-tag packaging-fix HEAD (finalize-dist internalization, honest bundle budgets, literal engine imports): install smoke fresh 14 assertions/0 violations, provenance signature-verified/0 violations, `head-to-head:installed` 24/24, K2 `supersede` 14/14 re-earned.

## Still open (not claimed)

- Turbo + skyline + smart-city route gates (human approval, camera re-probe, framing fix) — tracked in the release checklist, not blockers for the engine release.
- Marketing-site deploy + deployed-origin proof (L6) — DONE post-publish: production deployment aliased to `https://aura3d.auraone.ai` (homepage 200 with v3.0.0 LIVE pill, docs + llms.txt 200, hosted full-page screenshot retained at `release-artifacts/3.0-homepage-origin.png`).
