# Aura3D 3.0.0 Release Notes

Version: 3.0.0

Status: candidate — NOT yet published. K2 readiness, tag, npm publish, and deployed-site proof are pending (see Blocked below).

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

## Blocked before publish

- K2 readiness `supersede` on the release commit (needs settled tree + runnable browsers).
- Turbo + skyline + smart-city route gates (human approval, camera re-probe, framing fix).
- Tag `v3.0.0`, GitHub release, npm publish of 29 packages, marketing-site deploy + origin proof.
