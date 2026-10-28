# Animation On The Root: Layers, Root Motion, Retargeting, Two-Bone IK

Status: Aura3D 4.5.0 root receipts. Every example below is typechecked against the real root declarations in
`tests/unit/agent-api/animation-root-examples.ts`, and each capability has a remote pixel receipt under
`evidence/receipts/<capability>/<version>.json` written by `tests/browser/animation-root-receipts.spec.ts`.

These four features are reached through a runtime-node handle (`app.nodes.require(id)`) on a typed GLB model, with no
import from `@aura3d/animation`. They need the model node to carry `.runtime({ id })` and `await app.ready()` before use.

The examples assume one scene with two models and a target marker:

```ts
import { camera, createAuraApp, defineModelAssets, lights, model, primitives, scene } from "@aura3d/engine";
import type { AuraActorAnimationApi, AuraApp, AuraRuntimeNodeHandle } from "@aura3d/engine";

type Actor = AuraRuntimeNodeHandle & { readonly animation: AuraActorAnimationApi };
```

## Layers

`playLayer(layer, clip, { weight, fadeIn, mask, blendMode })` plays a clip on a named layer over the base clip.
`mask` takes `{ humanoid: "upper-body" | "lower-body" | "head" | "arms" }` or explicit `include` / `exclude` bone names.
`blendMode: "additive"` adds the clip over the base instead of overriding it. `stopLayer(layer, fadeOut)` removes it.
`animationState().activeActions` lists each action with its `layer`.

```ts
export async function layers(): Promise<void> {
  const app = await mount();
  const hero = app.nodes.require("hero") as Actor;
  hero.play("Idle", { loop: true });
  // Run drives only the upper body; the legs keep playing Idle underneath.
  hero.animation.playLayer("upper", "Run", { weight: 1, mask: { humanoid: "upper-body" } });
  // Later: fade the layer out over a quarter second.
  hero.animation.stopLayer("upper", 0.25);
}
```

## Root motion

`play(clip, { rootMotion })` takes `{ mode: "apply" | "extract-only", bone?, axes? }`. `apply` integrates the root bone's
travel into the node transform (and yaw when `"yaw"` is in `axes`) and keeps the hips pinned in the pose;
`extract-only` reports it without moving the node. Leaving `rootMotion` out plays the clip in its authored space.

```ts
export async function rootMotion(): Promise<void> {
  const app = await mount();
  const hero = app.nodes.require("hero") as Actor;
  // "apply" moves the node by the clip's authored travel and pins the hips; "extract-only"
  // leaves the node where it is and only reports the travel.
  hero.play("Run", { loop: true, rootMotion: { mode: "apply", bone: "mixamorig:Hips", axes: ["x", "z"] } });
}
```

## Retargeting

`node.animation.addClipsFrom(source, options?)` bakes another skeleton's clips onto this node's skeleton and registers
them by name. `source` is the source model node (its handle or id), a `{ skeleton, clips }` pair, or another actor's
animation runtime. Without `options.map` both humanoid rigs are inferred from bone names; `hipsScale` defaults to
`"leg-length"`. It rejects with `ANIMATION_RETARGET_SOURCE_NOT_LOADED` if the source node has not loaded.
Registered names are the source clip names, so a source clip with the same name as a target clip replaces it.

```ts
export async function retargeting(): Promise<readonly string[]> {
  const app = await mount();
  const hero = app.nodes.require("hero") as Actor;
  const bot = app.nodes.require("bot") as Actor;
  await app.ready();
  hero.play("Idle", { loop: true });
  bot.play("Idle", { loop: true });
  // Bake the hero's clips onto the bot's skeleton (bone names are inferred for both rigs).
  const baked = await bot.animation.addClipsFrom(hero);
  bot.play("Run", { loop: true });
  return baked;
}
```

## Two-bone IK

`node.animation.ik.add({ kind: "two-bone", root, mid, tip, target, pole?, weight?, allowStretch? })` solves a limb so
`tip` reaches `target` (a world point, a node id or name, or `{ socket: bone }`) after the clip pose each frame.
It returns a disposer; `ik.clear()` removes every constraint on the node.

```ts
export async function twoBoneIk(): Promise<() => void> {
  const app = await mount();
  const hero = app.nodes.require("hero") as Actor;
  hero.play("Idle", { loop: true });
  app.nodes.require("reach").setPosition(0.3, 1.5, 0.6);
  // The right hand follows the "reach" node until the returned disposer runs.
  return hero.animation.ik.add({
    kind: "two-bone",
    root: "mixamorig:RightArm",
    mid: "mixamorig:RightForeArm",
    tip: "mixamorig:RightHand",
    target: "reach",
    pole: "auto"
  });
}
```

## What the receipts prove, and what they do not

Each receipt is a remote software-WebGL2 run on a Soldier and an Expressive Robot GLB (three.js examples) with PNG frames,
their hashes and the measured values the spec asserted on. They prove the four calls above change the rendered pose as
described. They do not prove retargeting for arbitrary rigs (only rigs whose bones infer to a humanoid map, or an explicit
`map`), full-body IK, or any speed claim. See [claims-and-boundaries](../agents/claims-and-boundaries.md).
