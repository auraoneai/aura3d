# Worked example: aura3d-character-animation

Date: 2026-09-25. Run in `packages/create-aura3d/templates/mini-game` with the
local CLI build (`packages/aura3d-cli/dist/cli.js`, 3.0.1) against the shipped
`showcaseKenneyOobiPlatformerHero` GLB. No files were written. No browser
capture was run locally.

## Goal

Get real clip, joint, and morph names for the platformer hero, map gameplay
actions to clips, and confirm the controller API surface before writing code.

## Commands run

1. `assets inspect public/aura-assets/showcaseKenneyOobiPlatformerHero.3f821141.glb --animation --skeleton --morphs`.
   Trimmed real output:

   ```json
   {
     "ok": false,
     "animations": ["attack-kick-left", "attack-kick-right", "attack-melee-left", "attack-melee-right",
       "crouch", "die", "drive", "emote-no", "emote-yes", "fall", "holding-both", "holding-both-shoot",
       "holding-left", "holding-left-shoot", "holding-right", "holding-right-shoot", "idle",
       "interact-left", "interact-right", "jump", "pick-up", "sit", "sprint", "static", "walk"],
     "skeleton": {"skinCount": 1, "jointCount": 6, "skins": [{"joints": ["root", "leg-left", "leg-right", "torso", "arm-left", "arm-right"]}]},
     "morphTargets": {"targetCount": 0, "messages": ["No morph target metadata detected."]},
     "warnings": ["orientation metadata missing; facing direction cannot be validated until GLTF extras declare aura3d.orientation.forwardAxis"]
   }
   ```

   `"ok": false` accompanies the orientation warning. No morph targets means no
   viseme or morph work on this rig. The skinning doc also notes "drive" is a
   static pose, so it cannot satisfy an animation row.

2. `assets validate-animation --clips idle,walk,sprint,jump --map idle=idle,walk=walk,run=sprint --require idle,walk,run`:

   ```json
   { "ok": true, "messages": ["action \"idle\" -> \"idle\" OK", "action \"walk\" -> \"walk\" OK", "action \"run\" -> \"sprint\" OK"], "failures": [], "missingActions": [], "missingClips": [] }
   ```

3. Negative case, `--clips idle,walk --map idle=idle,walk=walk --require idle,walk,run`:

   ```json
   { "ok": false, "failures": ["required action \"run\" has no clip mapped."], "missingActions": ["run"] }
   ```

4. `assets assemble-character --help`:

   ```text
   Usage: aura3d assets assemble-character --name hero --body bodyAsset [--part hair=hairAsset] [--part weapon=weaponAsset]
   ```

5. Controller surface via a throwaway Node script importing
   `createAnimationController` from the engine dist:

   ```text
   controller methods: play:function crossFade:function update:function onEvent:function bindRuntimeNode:function stop:function restart:function
   ```

   Note: `llms.txt` writes clip events as `animation.onEvent(...)`, where
   `animation` is a controller variable. The exported `animation` namespace has
   no `onEvent`, so the skill says "the controller's event subscription" to
   avoid pointing agents at the namespace.

## Not run locally (remote evidence)

- `--require-rig` was not exercised.
- Browser pixel proof: deterministic capture times inside the "walk" clip's
  keyframe range, stable camera, character-region pixel delta, backend named.
  Runs via the template `npm run test` (includes `tests/certified-rig.spec.ts`)
  or CI.
- Voice-bridge viseme sync was not exercised; this rig has no morph targets.
