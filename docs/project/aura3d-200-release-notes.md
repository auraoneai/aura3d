# Aura3D 2.0.0 Release Notes

Version: 2.0.0

Status: published on npm and GitHub; canonical website deployed

Aura3D 2.0 is a major competitive replatform, not a relabeled 1.6 build. The
major version records a changed public contract: fewer duplicate public hosts,
clear ownership for retained subsystems, typed real assets as the default
public proof path, and explicit separation between the safe root API,
production runtime, lower-level rendering packages, internal contracts, and
prototype work.

## Public-surface changes

- New applications use the independent `@aura3d/lean` package. Its core,
  `/product`, and `/game` exports provide primitive WebGL2 scenes, typed
  GLB/glTF product loading, and solver-free deterministic arcade motion. The
  package's measured transitive Aura closure excludes the compatibility
  engine, physics/Rapier, navigation, editor, and Node-media ownership.
- The historical `@aura3d/engine/lean*` subpaths remain as deprecated
  compatibility aliases. The broad `@aura3d/engine` package remains available
  for applications that intentionally need its compatibility surface.
- Product-viewer and mini-game scaffolds install `@aura3d/lean` directly. The
  asset CLI preserves that topology when it regenerates `src/aura-assets.ts`;
  it selects the engine asset brand only when the project explicitly declares
  `@aura3d/engine`.
- The public `examples/` inventory is reduced to retained routes that have a
  declared owner and an honest claim boundary.
- Duplicate or contract-only product, material, character, physics, shadow,
  HDR, WebGPU, editor-output, asset-gallery, interaction, and interior hosts
  are internal fixtures rather than public showcase entries.
- Distorted or misleading game and racing routes are removed from the public
  surface. Their existence is not counted as game-quality or ecosystem-parity
  evidence.
- Public named subjects use typed manifest assets. Raw model URLs, guessed
  sample URLs, primitive substitutes, and DOM/Canvas2D imitations are excluded
  from safe public examples.

## Visual-quality work

The 2.0 audit reviews each retained route at both canvas and full-page level.
Repairs completed in the current candidate include:

- a real typed expressive robot and changed-pose proof for Character Animation
  Viewer;
- unobscured material swatches, corrected orthographic framing, and preserved
  16:9 geometry in Material Showroom;
- spherical, evenly spaced, labeled PBR extension variants with corrected
  readback points and aspect ratio;
- a typed headphones subject and sharper 384x216 processing targets in
  Postprocess Lab;
- readable multi-row Renderer Stress Lab framing while retaining off-frustum
  culling evidence;
- continuous presentation and viewport-bounded telemetry for the deterministic
  Large Scene renderer harness;
- explicit diagnostic labeling for particles, state machines, custom
  materials, raycast/CCD, stress, and large-scene workloads.

Automated capture is not human acceptance. The final 86-artifact packet was
approved by Gurbaksh Chahal on August 12, 2026 with no blocking visual issues.
The hash-bound approval is retained in
`release-artifacts/2.0-final-visual-review-approval.json`.

The generated-template gate passes 149/149 source checks across all 19
scaffolds. A separate clean lifecycle installs the exact Aura3D 2.0.0 tarballs
and passes the same 149/149 checks across all 19 scaffolds: dependency install,
typecheck, production build, browser load, meaningful interaction, static
preview, screenshot, route health, deploy behavior, asset replacement where
applicable, regenerated types, negative asset tests, and dependency-isolation
assertions. These checks establish the stated scaffold contracts; they do not
by themselves establish photorealism or universal Three.js parity.

The packed migration consumer installs all 29 exact 2.0.0 tarballs, compiles
every TypeScript example in the three 2.0 migration guides with library type
checking enabled, exercises the codemod, imports retained compatibility and
dedicated package entries, and verifies that removed fabricated postprocessing
imports fail with an actionable migration message.

## Three.js comparison boundary

Historical `three@0.165.0` reports remain historical. Aura3D 2.0 comparison
work uses the repository-locked current target, `three@0.185.1`, and requires
same-workload and same-asset evidence. Passing an internal contract, rendering
a different scene, or retaining a route with the right title does not prove
head-to-head parity. Universal Three.js ecosystem parity is not currently
claimed.

## Install

```sh
npx create-aura3d@2.0.0 my-scene --template product-viewer
npm install @aura3d/lean@2.0.0
```

Use `@aura3d/lean/product` for typed product scenes and
`@aura3d/lean/game` for deterministic arcade motion. Use
`@aura3d/engine@2.0.0` when an application intentionally needs the broader
compatibility-heavy safe authoring surface.

## Publication status

All 29 public packages are published in version lockstep at `2.0.0`. Public
npm readback verified every package and uploaded SHA-512 integrity. All 396
published versions below 2.0.0 across the 26 packages with older histories are
deprecated with a 2.0 migration notice; the three new packages have no older
versions. The two complete serial release suites passed from the same clean
candidate, including all 19 source and exact-installed-tarball scaffold
lifecycles.

GitHub tag `v2.0.0`, the public GitHub release, and the canonical
`https://aura3d.auraone.ai` deployment are live. Historical releases remain
available for reproducibility but are superseded by 2.0.0. Game, lighting,
evidence, and website changes made after the tag are post-release source work;
they are not represented as bytes contained in the immutable 2.0.0 tarballs.
