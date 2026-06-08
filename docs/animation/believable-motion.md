# Believable-Motion runtimes (1.3)

The 1.3 track adds four motion-quality runtimes to `@aura3d/animation` + `@aura3d/rendering`, plus a
morph-influence API in `@aura3d/engine`. Each is pure/deterministic where it can be, gate-backed
(`pnpm animation-engine:believable-motion`), and wired live into the Aura Clash arena.

Each runtime is a real, gate-backed engine feature. Foot IK is per-limb two-bone; spring bones are
secondary dynamics. See `docs/project/known-limits.md` for the precise capability boundaries.

## 1. Critically-damped, momentum-preserving transitions

A drop-in replacement for the linear crossfade: the source clip's weight decays on a critically-damped
curve (zero initial slope, momentum carries through) instead of a straight ramp, so state changes
read as a smooth dissolve-free blend. Deterministic — a pure function of elapsed time.

```ts
import { fighterInertializedWeights, createInertializer } from "@aura3d/animation";

// Weight-domain: smooth source->dest blend weights for an applyClips() call.
const blend = fighterInertializedWeights("idle", "walk", elapsed, duration); // { weights: [from, to] }

// Pose-domain: decay the captured pose offset on top of the destination pose.
const transition = createInertializer({ halfLife: 0.12 });
transition.recordTransition(previousPose, targetPose);
const pose = transition.sampleInertialized(t);
```

`AnimationMixer.inertialCrossFade(from, to, halfLife)`, `AnimationStateMachine.stateBlend()`, and the
`LocomotionKit` sample's `stateTransition` all route through this. The linear `fighterCrossfadeWeights`
is retained as an explicit fallback.

## 2. Foot IK with a foot-lock

Runtime two-bone foot IK (built on `solveTwoBoneIk`) plus a ground query and a foot-lock: a planted
foot is pinned to its world contact point during stance and released on lift, so feet stop sliding on
uneven ground. The animation package stays physics-free — you inject a ground query (the analytic
`createHeightFieldGround`, or `@aura3d/physics`'s `groundHeightRaycaster` adapter).

```ts
import { createFootIkRig, createHeightFieldGround } from "@aura3d/animation";

const rig = createFootIkRig({ legs, raycaster: createHeightFieldGround((x, z) => ({ height: 0 })) });
const result = rig.solveFootPlacement(); // grounds feet, holds planted feet, drops the hip to reach
```

`LocomotionKit` and `LocomotionController` expose an optional `footIk` hook.

## 3. Spring-bone secondary dynamics

An integrated spring chain (semi-implicit Euler + distance constraint + optional sphere/capsule
push-out) for weighty secondary motion — accessories, tails, or a body-sway that lags into
acceleration. Deterministic given a fixed `dt`.

```ts
import { createSpringChain } from "@aura3d/animation";

const chain = createSpringChain({ bones, stiffness: 40, damping: 4, gravity: [0, -9.81, 0] });
chain.integrate(dt, { position: rootWorldPosition }); // tip lags under root motion, then settles
chain.positions(); // write back to bones, or read telemetry()
```

Tag a bone subtree with `Bone.springChain` and use `Skeleton.springChainIndices` /
`Skeleton.writeSpringChainBack` to bind a chain to a skeleton.

## 4. Animation event tracks

Named lanes of typed markers on a clip timeline — hitbox active-frame windows, footsteps, VFX — on
top of the existing event dispatcher/sampler. Author them with `EventTrackEditor`
(`@aura3d/editor-runtime`) and drive gameplay / playback from the authored clip events.

```ts
import { createAnimationEventTracks, sampleClipEvents } from "@aura3d/animation";

const tracks = createAnimationEventTracks("heavy", 0.46);
tracks.addMarker("hitbox", 0.1, { type: "hitbox", duration: 0.28 }); // active-frame window
tracks.addMarker("footstep", 0.05, { type: "footstep" });
tracks.isActive("hitbox", 0.2); // -> true (hitbox live)
const fired = sampleClipEvents({ ...tracks.toEventSource(), id: "heavy" }, { from, to });
```

## 5. Morph-target hardening + viseme lip-sync

`@aura3d/rendering`'s `createMorphTargetPlan` chooses a uniform fast path (≤4 targets / 64 verts), a
texture-backed path for large facial blendshape rigs (lifting the old GPU cap, sized to device
limits), or a CPU fallback — and packs position **and normal** deltas so lighting follows the
deformation. The glTF loader exposes all morph targets + `mesh.extras.targetNames`; drive them with
the first-class API and viseme lip-sync:

```ts
node.morphInfluence("jawOpen", 0.8);              // set a named blendshape weight
applyVisemeMorphInfluences(node, visemeSample);    // drive blendshapes from a sampled viseme
```

## 6. WebGPU 96-joint skinning parity

WebGPU character skinning now carries a 96-joint palette (`MAX_WEBGPU_SKINNING_JOINTS = 96`), matching
the WebGL2 `u_jointMatrices[96]` path — the WGSL `DrawUniforms` carries a 96-entry joint palette and
the device skins the full palette. Real-device WGSL execution remains evidence-bound; the emulated
rasterizer covers correctness in CI.

## Aura Clash showcase

The deployed Aura Clash arena exercises these live: critically-damped move transitions, foot-IK
foot-lock with footsteps, spring body-sway, and authored clip-event hit/footstep/VFX frames — all
presentation-layer, so the deterministic combat replay checksum is unchanged. The fighter rigs carry
no facial blendshapes, so morph/viseme is showcased by Animation Studio and the morph proofs instead.
