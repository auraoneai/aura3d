---
name: aura3d-character-animation
description: Drives rigged Aura3D characters from inspected clip, skeleton, and morph metadata with an animation controller, clip events, runtime pose and morph state, and voice-bridge visemes, then proves motion in character-region pixels. Use when animating a humanoid or creature, using `AnimationController`, `createAnimationController`, or `animation.sampleAuraVoiceBridgeAtTime`, setting morph targets or visemes, or running `assets inspect --animation`, `assets validate-animation`, or `assets assemble-character`.
---

# Aura3D character animation

Clip, bone, and morph names come from the asset, never from memory. Controller
state is source evidence; a visible animation claim needs pixel deltas on the
character. Shared rules (claim labels, forbidden patterns, typed assets,
benchmark mode) are in [boundaries](../aura3d-core/references/boundaries.md).

## Establish the contract

1. Run `npx @aura3d/cli@latest --help` and use only the `assets inspect`,
   `assets validate-animation`, and `assets assemble-character` flags it prints.
2. Read `src/aura-assets.ts` and `aura.assets.json`. The character must be a
   typed key with role `character`. No key: load `aura3d-assets` first.
3. Inspect the rig and record the real names:

   ```bash
   npx @aura3d/cli@latest assets inspect ./public/aura-assets/hero.glb --animation --skeleton --morphs
   ```

   Read the JSON fields "animations", "skeleton.skins[].joints", and
   "morphTargets.targetNames".
   `"No morph target metadata detected."` means no morph or viseme work on
   this asset.
4. Decide the mode. Benchmark mode: `npm install && npm run build`, then stop.

## Procedure

1. Map gameplay actions to real clip names and fail fast on gaps:

   ```bash
   npx @aura3d/cli@latest assets validate-animation --clips idle,walk,sprint,jump \
     --map idle=idle,walk=walk,run=sprint --require idle,walk,run --require-rig
   ```

   Pass `--clips` from the inspection output. `"ok": false` with a
   `missingActions` entry means the rig cannot play that action.
2. Multi-part characters: build the assembly from typed keys first.

   ```bash
   npx @aura3d/cli@latest assets assemble-character --name hero --body heroBody --part hair=heroHair
   ```

3. Create one controller per character from typed clip metadata, bind it to a
   runtime node, and update it once per frame:

   ```ts
   import { createAnimationController, createAuraApp, game, lights, model, scene } from "@aura3d/engine";
   import { assets } from "./aura-assets";

   const app = createAuraApp("#app", {
     scene: scene()
       .add(model(assets.hero).runtime(game.runtimeNode("hero", { tags: ["player"] })))
       .add(lights.studio())
   });
   const hero = app.nodes.require("hero");
   const controller = createAnimationController({
     id: "hero-animation",
     clipRegistry: assets.hero,
     requiredClips: ["idle", "walk", "sprint"],
     suppressRootMotion: true
   });
   controller.bindRuntimeNode(hero, { id: "hero-binding", defaultClipId: "idle" });

   let moving = false; // set from your input or kinematic body each frame
   app.onFrame(({ dt }) => {
     controller.crossFade(moving ? "walk" : "idle", 0.12);
     controller.update(dt);
   });
   ```

4. Clip-local gameplay events (event names such as "hitbox.open", "sfx", "vfx",
   "camera.impulse", "caption", "viseme") go through the controller's event subscription. Bridge
   them into public systems such as `game.combatWorld`; never call private
   hitbox or renderer internals.
5. Pose and morph state go through the runtime node handle (its animation-pose
   and morph-target setters). App code never reaches into renderer skinning.
6. Voice sync: sample the bridge package at the frame time and apply the
   viseme weights to the node's morph targets, using only morph names the
   inspection reported.

   ```ts
   import { animation } from "@aura3d/engine";

   app.onFrame(({ time }) => {
     const sample = animation.sampleAuraVoiceBridgeAtTime(bridgePackage, time, "host");
     app.nodes.require("host").setMorphTargets(sample.viseme?.blendshapeWeights ?? {});
   });
   ```

7. Retargeting is explicit and selected-roster only. Use an explicit humanoid
   map; do not claim arbitrary-rig retargeting or full-body IK.
8. Normal mode: `npm run build` locally. Browser proof (deterministic capture
   times inside the clip's keyframe range, stable camera, character-region
   pixel delta, backend and fallback named) runs remotely via the template
   `npm run test` or CI. Hand results to `aura3d-evidence-review`.

## Stop and report

- A clip, bone, or morph you need is absent from the inspection output: stop
  and report it. Do not rename clips in code or guess names.
- `assets validate-animation` returns `"ok": false`: the action map is
  `blocked` until a rig with the clip is admitted.
- A clip is a static pose (zero channel motion): it cannot satisfy an
  animation row; pick a clip with real motion or label `prototype`.
- The claim is "visible skinning, morphs, or visemes" and you only have
  controller snapshots or clip lists: label it `prototype`.
- Only the certified roster in the skinning doc may be called certified.
- Benchmark mode: stop after the build and report the runner-owned command.

## References

- [Shared boundaries](../aura3d-core/references/boundaries.md)
- [Skinning and morphs](https://github.com/auraoneai/aura3d/blob/main/docs/rendering/skinning-and-morphs.md)
- [Animation, retargeting, IK](https://github.com/auraoneai/aura3d/blob/main/docs/rendering/animation.md)
- [Animation runtime events](https://github.com/auraoneai/aura3d/blob/main/docs/api/animation-runtime-events.md)
- [Animation runtime support](https://github.com/auraoneai/aura3d/blob/main/docs/animation/runtime-support.md)
- [Agent guide llms.txt](https://github.com/auraoneai/aura3d/blob/main/llms.txt)
