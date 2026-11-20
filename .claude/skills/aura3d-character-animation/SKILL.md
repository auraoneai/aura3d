---
name: aura3d-character-animation
description: Drives rigged Aura3D characters from inspected clip, skeleton, and morph metadata with an animation controller, clip events, runtime pose and morph state, and voice-bridge visemes, then proves motion in character-region pixels. Use when animating a humanoid or creature, using `AnimationController`, `createAnimationController`, or `animation.sampleAuraVoiceBridgeAtTime`, setting morph targets or visemes, or running `animation import`, `animation generate`, `assets inspect --animation`, `assets validate-animation`, or `assets assemble-character`.
---

# Aura3D character animation

Clip, bone, and morph names come from the asset, never from memory. Controller
state is source evidence; a visible animation claim needs pixel deltas on the
character. Shared rules (claim labels, forbidden patterns, typed assets,
benchmark mode) are in [boundaries](../aura3d-core/references/boundaries.md).

## Look target

A character reads through its silhouette and rim: `character-showcase` (or the
genre recipe's look) supplies the 3/4-front key plus rim that makes locomotion,
poses and morphs visible. Judge animation under that look — a clip that reads
in flat light can vanish inside night-city shadow pools or golden-hour haze. A dark character on a dark set needs a rim or back light or a lighter accent; judge a back-view frame at gameplay distance.

## Establish the contract

1. Run `npx @aura3d/cli@latest --help` and use only the `assets inspect`,
   `assets validate-animation`, `animation import`, `animation generate` and
   `assets assemble-character` flags it prints.
2. Read `src/aura-assets.ts` and `aura.assets.json`. The character must be a
   typed key with role `character`. No key: load `aura3d-assets` first.
   Need a new lifelike humanoid? Run
   `assets generate "<subject>" --kind character --rig` (paid fal.ai,
   `--dry-run` first; it faces, scales and grounds the model, and
   `assets normalize` re-tunes that), then `assets validate --skin`. Missing
   clips: retarget BVH, FBX, GLB or HY-Motion motion with `animation import`,
   or make them from text with `animation generate`
   ([import and generate](references/import-and-generate.md); its engine is the
   5.6.0 `@aura3d/animation` humanoid module: `smplMotionToClip`,
   `skeletalMotionToFrames`, `mapHumanoid`, `createHumanoidDriver`). Play
   canonical humanoid clips with `createHumanoidAnimator` (5.7.0, below).
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
   `missingActions` entry means the rig cannot play that action. Then run
   `assets validate --skin <glb>`: it fails on stretched triangles, flaps and
   a mesh not in its skeleton's pose (`assets repair-skin` fixes or guides).
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

   Canonical `HumanoidClip`s (from `animation generate` / `import`) play
   through `createHumanoidAnimator(clips)` from `@aura3d/engine/animation`, one per body: cross-fades, mirrored clips, code poses, and `humanoidLocomotionTime` for distance-driven clip time so feet never slide. Never hand-roll a motion player, cross-fader or clip clock ([import and generate](references/import-and-generate.md)).
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

7. Retargeting runs at import time onto humanoid rigs:
   `animation import <src> --onto rig.glb --out hero.glb` maps roles
   automatically (`--map` to override), fails on limb flips or a frozen T-pose, and runs the skin check
   (allow-list aware; `--strict` fails on any unlisted skin error). Do not
   claim arbitrary-rig retargeting or full-body IK at runtime.
8. Normal mode: `npm run build` locally. Browser proof (deterministic capture
   times inside the clip's keyframe range, stable camera, character-region
   pixel delta, backend and fallback named) runs on a remote runner
   (`tools/remote-acr/run.sh` in the monorepo, or the template's `npm run test`
   on a remote worker), never local Playwright. Hand results to `aura3d-evidence-review`.

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
- `animation import` or `animation generate` exits 1: read the named check
  (limb flip, retarget error, T-pose, skin); fix the rig or pick a gentler
  clip. Never ship the clip by loosening the allow-list without a reason.

## References

- [Shared boundaries](../aura3d-core/references/boundaries.md)
- [Skinning and morphs](https://github.com/auraoneai/aura3d/blob/main/docs/rendering/skinning-and-morphs.md)
- [Animation, retargeting, IK](https://github.com/auraoneai/aura3d/blob/main/docs/rendering/animation.md)
- [Animation runtime events](https://github.com/auraoneai/aura3d/blob/main/docs/api/animation-runtime-events.md)
- [Animation runtime support](https://github.com/auraoneai/aura3d/blob/main/docs/animation/runtime-support.md)
- [Asset workflow (rig and clip admission)](https://github.com/auraoneai/aura3d/blob/main/docs/agents/asset-workflow.md)
- [Agent guide llms.txt](https://github.com/auraoneai/aura3d/blob/main/llms.txt)
- [Character staging and lighting](references/stage-and-lighting.md)
- [Import and generate motion](references/import-and-generate.md)
