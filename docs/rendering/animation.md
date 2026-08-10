# Animation, Retargeting, IK, And Lifecycle

Status: Aura3D 2.0 bounded animation receipt.

Aura3D has browser-visible root animation proof and broader package-level
animation behavior. The two surfaces are deliberately described separately so
package tests do not become unsupported root claims.

## Proven root safe API

A route importing only public `@aura3d/engine` APIs proves all of the following
through the production runtime:

- a typed GLB with a skin and named clip visibly changes pose;
- the camera remains stable while 108,019 subject-region pixels change, with a
  7.267 mean delta and an updated skinning palette;
- named play, pause, loop, seek, and crossfade state reaches the runtime;
- clip motion changes 163,626 subject-region pixels, while a paused sample
  changes zero;
- a named morph target changes 27,906 subject-region pixels both when enabled
  and when returned to neutral.

These are rendering claims, not metadata claims. Static typed GLBs remain valid
content, but a static pose cannot satisfy an animation row.

## Proven package behavior

Focused `@aura3d/animation` and `@aura3d/assets` tests prove additive layers,
weighted blending, crossfade, root-motion extraction, deterministic clip
events, clip/action state, explicit humanoid pose retargeting, and imported
two-bone IK. Retargeting reconciles different rest orientations, translation
scale, and facing axes through an explicit humanoid map.

This does not mean automatic arbitrary-rig retargeting. The IK receipt covers a
two-bone imported-skeleton chain, not full-body IK.

## Current Three.js comparison

The canonical gate resolves the current reference baseline before it runs. The
recorded baseline is actual `three@0.185.1` / r185. Aura3D and Three.js then load
the same Robot Expressive asset and execute selected browser workloads with
their real loaders, animation systems, and renderers:

| Workload | Required Three.js path | Structural similarity proxy |
| --- | --- | ---: |
| Additive animation | `AnimationMixer` plus additive blend mode | 0.934 |
| Weighted clip blending | `AnimationMixer` | 0.941 |
| Imported-skeleton two-bone IK | actual bone transforms | 0.974 |
| Morph targets | actual morph-target influences | 0.968 |

These values establish bounded parity for the selected asset and workloads.
They do not establish blanket parity for arbitrary rigs, clips, masks,
transition graphs, morph combinations, or animation authoring tools.

## Lifecycle

The browser lifecycle proof performs three complete real WebGL2 cycles:
load the GLB, create a mixer, play and apply 18 tracks with skinning, render,
stop, dispose the mixer, dispose the asset pipeline, and dispose the renderer.
Every cycle ends with zero active clips, zero mixer actions, and zero tracked
buffers, shaders, textures, render targets, buffer bytes, texture bytes, and
approximate GPU bytes. Mixer disposal is idempotent; subsequent mutation,
lookup, or update calls reject use of the disposed binding.

This is a tracked renderer/mixer resource guarantee. It is not a claim that a
browser heap measurement can prove every JavaScript object was immediately
garbage-collected.

## Reproduce the receipt

```bash
pnpm renderer:animation
```

The command verifies the online Three.js baseline, builds the workspace, runs
49 focused unit tests, runs 11 browser tests, and writes a 13/13 aggregate gate
to `tests/reports/animation-complete/report.json`. Its underlying receipts are:

- `tests/reports/animation-complete/root-skinned-pose.json`
- `tests/reports/animation-complete/root-clip-controls.json`
- `tests/reports/animation-complete/root-morph-targets.json`
- `tests/reports/animation-complete/resource-lifecycle.json`
- `tests/reports/threejs-parity/skinning-additive-parity.json`
- `tests/reports/threejs-parity/skinning-blending-parity.json`
- `tests/reports/threejs-parity/skinning-ik-parity.json`
- `tests/reports/threejs-parity/morphtargets-parity.json`
