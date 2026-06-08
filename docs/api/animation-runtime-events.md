# Aura3D Animation Runtime, Events, And Viseme Sync

Status: 1.1.0 scoped runtime-foundation guidance.

This page documents the safe agent pattern for skeletal animation, animation
events, and viseme/blendshape sync. It is intentionally stricter than the
source API surface: agents may use the public APIs shown here, but release
claims require browser-visible evidence, screenshots, JSON reports, and typed
asset provenance.

Use this page with:

- `docs/api/game-runtime.md`
- `docs/api/assets.md`
- `docs/api/prompt-animation.md`

## Current Boundary

The 1.1.0 source baseline already has:

- `createAuraApp(...)`, `app.onFrame(...)`, `app.step(dt)`, and runtime nodes.
- `AnimationController` / `createAnimationController(...)` with named clips,
  restart, crossfade, events, layers, pose capture, diagnostics, and
  runtime-node binding metadata.
- Runtime node methods for animation metadata, pose snapshots, and morph
  target weights.
- Prompt animation helpers for captions, AuraVoice bridge packages, viseme
  tracks, and deterministic evidence metadata.

Aura3D 1.1.0 release claims must prove:

- Named GLB clips visibly deform skinned characters in a browser route.
- Restarting an attack clip visibly resets the clip to frame zero.
- Blending and layer weights visibly affect the character, not only metadata.
- Clip-local animation events drive gameplay systems deterministically.
- Viseme/blendshape weights are sampled from typed timing data and rendered
  within one frame at 30 fps.

Do not claim skeletal animation, clip blending, or GLB blendshape sync is
release-ready from source metadata alone. Capture the evidence listed at the
end of this page.

## Safe Imports

Gameplay and animation routes should import from the public root package and use
typed assets from `./aura-assets`.

```ts
import {
  AnimationController,
  captionCueAtTime,
  createAuraApp,
  createAnimationController,
  createAuraVoiceVisemeTrack,
  createGlbBlendshapeVisemeCue,
  createPrimitiveMouthVisemeCues,
  game,
  lights,
  model,
  sampleAuraVoiceBridgeAtTime,
  scene
} from "@aura3d/engine";
import { assets } from "./aura-assets";
```

Do not import `three`, `GLTFLoader`, renderer internals, raw GLB URLs, or string
model ids. If an example needs a character, add or resolve a real asset first.

```bash
npx @aura3d/cli@latest assets search "stylized humanoid fighter with idle run punch clips" --profile fighting-character --json
npx @aura3d/cli@latest assets resolve "stylized humanoid fighter with idle run punch clips" --name fighter --profile fighting-character
npx @aura3d/cli@latest assets inspect ./assets/fighter.glb --animation --skeleton --morphs --license
npx @aura3d/cli@latest assets add ./assets/fighter.glb --name fighter
```

If a CLI command name changes, use the established equivalent. The requirement
is the capability: catalog search, typed pull or add, animation inspection,
skeleton inspection, morph target inspection, license/source evidence, and
generated `src/aura-assets.ts`.

## Runtime Node Setup

Mark every model that gameplay, animation, visual scripting, or editor tools
need to mutate with `.runtime(game.runtimeNode("id"))`.

```ts
const app = createAuraApp("#app", {
  scene: scene()
    .add(
      model(assets.fighter)
        .position(-1.2, 0, 0)
        .runtime(game.runtimeNode("player", { tags: ["fighter", "local", "typed-glb"] }))
    )
    .add(lights.studio())
});

const player = app.nodes.require("player");
```

`RuntimeNodeHandle` is the safe mutation surface. For current animation work,
these methods matter most:

- `play(clip, options)`
- `setAnimation(animation)`
- `setAnimationBinding(binding)`
- `setAnimationPose(pose, metadata)`
- `animationPose()`
- `setMorphTarget(name, weight)`
- `setMorphTargets(weights)`
- `morphTargets()`
- `snapshot()`

Use `snapshot()` and release evidence reports for diagnostics. Do not reach into
renderer internals from an agent-authored route.

## Named Clip Playback

Use `AnimationController` when the character has named GLB clips or sidecar clip
metadata. Required clip names must come from typed asset metadata or an
inspection report, not from guesses.

```ts
const animation = createAnimationController({
  id: "player-animation",
  clipRegistry: assets.fighter,
  requiredClips: ["Idle", "Run", "Jump", "LightPunch", "HitReact"],
  requiredBones: ["Hips", "Spine", "Head"],
  suppressRootMotion: true,
  layers: [
    { id: "base", role: "locomotion", bodyMask: "full-body" },
    { id: "upper-body", role: "attack", bodyMask: "upper-body", restartFromFrameZero: true }
  ]
});

animation.bindRuntimeNode(player, {
  id: "player-animation-binding",
  defaultClipId: "Idle"
});

const issues = animation.diagnostics({ requireSkeleton: true });
if (issues.some((issue) => issue.severity === "error")) {
  throw new Error(issues.map((issue) => issue.message).join("\n"));
}

animation.play("Idle", { loop: "loop", layer: "base" });

app.onFrame(({ dt }) => {
  animation.update(dt);
});
```

Current controller binding mirrors active clip, local time, speed, loop state,
layer metadata, event source, and binding metadata onto the runtime node. 1.1.0
renderer work must prove that the bound state also drives visible skinned GLB
pose output and morph target output in browser evidence.

## Restart And Blend

Input should drive animation through the same buffered and combo-aware input
controller that drives gameplay. Call `input.update(dt)` before animation state
queries.

```ts
const input = app.input({
  actions: {
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    jump: ["Space"],
    light: ["KeyJ"]
  },
  axes: {
    moveX: { negative: "left", positive: "right" }
  },
  bufferMs: 140,
  touch: true
});

app.onFrame(({ dt }) => {
  input.update(dt);

  const moving = Math.abs(input.axis("moveX")) > 0.05;
  animation.crossFade(moving ? "Run" : "Idle", 0.12, {
    layer: "base",
    restart: false
  });

  if (input.buffered("light", 140)) {
    animation.crossFade("LightPunch", 0.06, {
      layer: "upper-body",
      restart: true,
      restartFromFrameZero: true,
      attack: true
    });
  }

  animation.update(dt);
});
```

Evidence must prove both state and pixels:

- Controller snapshot shows `LightPunch` local time reset after repeated input.
- Browser screenshot or video frame shows the attack beginning again.
- Crossfade snapshot shows source/target clips and layer weights.
- Browser capture shows a visible pose transition, not only a metadata change.

## Animation Events To Gameplay

Animation events must be authored on the source clip timeline. Use event names
for gameplay meaning and event `type` for broad filtering.

```ts
animation.registerClip({
  id: "LightPunch",
  duration: 0.42,
  layer: "upper-body",
  restartFromFrameZero: true,
  events: [
    {
      name: "hitbox.open",
      type: "hitbox",
      time: 0.11,
      payload: {
        moveId: "player-light",
        damage: 7,
        activeFrames: [0, 4],
        hitbox: { offset: [0.52, 0.85, 0], size: [0.5, 0.4, 0.45] }
      }
    },
    { name: "hitbox.close", type: "hitbox", time: 0.19 },
    { name: "sfx.punch", type: "sfx", time: 0.1 },
    { name: "camera.impulse", type: "camera", time: 0.15 }
  ]
});
```

Bridge events into the public gameplay systems. `game.combatWorld()` currently
uses `beginAttack(...)` / `attack(...)` with active frame windows, so a release
route can translate `hitbox.open` into a deterministic combat move instead of
calling private hitbox internals.

```ts
const combat = game.combatWorld();

animation.onEvent("hitbox.open", ({ event, source }) => {
  const payload = event.payload as {
    moveId?: string;
    damage?: number;
    activeFrames?: readonly [number, number];
    hitbox?: { offset: readonly [number, number, number]; size: readonly [number, number, number] };
  } | undefined;

  combat.beginAttack("player", {
    id: payload?.moveId ?? `${source.clipId}:hitbox`,
    damage: payload?.damage ?? 1,
    activeFrames: payload?.activeFrames ?? [0, 3],
    durationFrames: 8,
    hitStop: 0.06,
    hitStun: 0.18,
    recovery: 0.12,
    knockback: [1.8, 0.4, 0],
    hitboxes: [
      {
        id: "event-hitbox",
        offset: payload?.hitbox?.offset ?? [0.5, 0.8, 0],
        size: payload?.hitbox?.size ?? [0.45, 0.4, 0.45]
      }
    ]
  });
});

animation.onEvent("camera.impulse", () => {
  director.impact(0.28, 0.14);
});
```

Event proof must include:

- Clip id, playback id, event name/type, previous local time, local time, and
  loop count.
- Gameplay side effect, such as active attack id, hitbox volume, effect id,
  camera impulse, HUD change, or caption id.
- Deterministic `app.step(dt)` reproduction.
- Browser screenshot or video frame for visible effects and overlays.

## Viseme And Blendshape Sync

Viseme timing should come from AuraVoice bridge data or a validated timing
track. The morph target names must come from typed GLB metadata, the bridge
package, or an explicit validated map.

```ts
const primitiveCues = createPrimitiveMouthVisemeCues({
  characterId: "host",
  speakerId: "host",
  lineId: "line-001",
  startTime: 0,
  endTime: 2.4
});

const visemes = createAuraVoiceVisemeTrack({
  episodeId: "animation-host-demo",
  language: "en",
  frameRate: 30,
  cues: primitiveCues.map((cue) =>
    createGlbBlendshapeVisemeCue({
      ...cue,
      blendshapeMap: {
        rest: "Mouth_Rest",
        aa: "Mouth_AA",
        ee: "Mouth_EE",
        oh: "Mouth_OH"
      }
    })
  )
});
```

At runtime, sample the bridge or viseme track and apply weights through the
runtime node handle. This is the safe route-level pattern for current release evidence.

```ts
app.onFrame(({ time }) => {
  const sample = sampleAuraVoiceBridgeAtTime(bridgePackage, time);
  const weights = sample.viseme?.blendshapeWeights ?? {};
  const caption = captionCueAtTime(captionTrack, time);

  player.setMorphTargets(weights);

  captionElement.textContent = caption?.text ?? "";
  captionElement.dataset.captionId = caption?.captionId ?? "";
});
```

If a GLB does not expose the required morph target names, the route must emit a
diagnostic and use an explicit fallback such as primitive mouth cards. Do not
claim GLB blendshape sync when the fallback path is active.

Viseme evidence must include:

- Audio or dialogue time.
- Caption id and text.
- Viseme id or phoneme id.
- Morph target names and weights.
- Runtime node id.
- Screenshot path and hash.
- Maximum drift in frames at the route frame rate.

## Deterministic Test Pattern

Use `app.step(dt)` to prove runtime, input, animation, physics, and visual graph
behavior without `requestAnimationFrame`.

```ts
app.pause();

input.press("KeyJ");
app.step(1 / 60);
input.release("KeyJ");

for (let i = 0; i < 12; i += 1) {
  app.step(1 / 60);
}

const proof = {
  runtime: app.runtime,
  player: player.snapshot(),
  animation: animation.snapshot(),
  pose: animation.capturePose({ emitEvent: false }),
  evidence: app.evidence({ input, combat })
};
```

The deterministic proof is necessary but not sufficient. 1.1.0 release gates
also require browser screenshots proving visible character deformation, event
effects, overlays, captions, and morph target changes.

## Release Evidence

Animation-runtime release evidence should write reports under:

- `tests/reports/animation-runtime/unit.json`
- `tests/reports/animation-runtime/browser.json`
- `tests/reports/animation-runtime/evidence.json`
- `tests/reports/animation-runtime/package-smoke.json`
- `tests/reports/aura3d105/release.json`

Minimum proof ids:

- `named-glb-clip-playback`
- `attack-clip-restart`
- `idle-run-crossfade`
- `upper-body-attack-layer`
- `animation-event-hitbox`
- `animation-event-camera-effect`
- `viseme-blendshape-sync`
- `deterministic-animation-step`
- `typed-animation-asset-provenance`

An animation route is not release-ready until source diagnostics, package
smoke, browser rendering, screenshots, JSON evidence, typed asset provenance,
and visual review all pass.
