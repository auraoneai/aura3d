/**
 * PRD-06 T0.16 — C-40 reference snippet (F-06-01..05) for
 * `aura3d-character-animation` SKILL.md (PRD 13 embeds it under Q-13-2).
 *
 * Rules this encodes:
 *   F-06-01  with A3D_QR_ANIMATION, bindRuntimeNode(node, { defaultClipId })
 *            drives GLB clips — never pass applyPose.
 *   F-06-02  map actions to the asset's real clip names from
 *            assets.hero.metadata.animations; run
 *            `aura3d animation inspect-clips` first.
 *   F-06-03  createAuraApp(..., { animation: { strict: true } }) throws on
 *            empty poses and unknown clips.
 *   F-06-04  animationState().tracksApplied > 0 is a precondition, not proof
 *            of quality.
 *   F-06-05  no poseBakedFallback / `tracks: []` clips.
 */

import { createAnimationController, createAuraApp, game, lights, model, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

// F-06-02 — clip ids come from the GLB's real clip names, not guessed strings.
const heroClips = assets.hero.metadata.animations;
//                                    ^ ["Idle", "Walk", "Run"] — verified by
// `aura3d animation inspect-clips <glb>`.

const app = createAuraApp("#app", {
  // F-06-03 — strict: an empty pose or an unknown clip id throws instead of
  // silently falling back.
  animation: { strict: true },
  scene: scene()
    .add(model(assets.hero).runtime(game.runtimeNode("hero", { tags: ["player"] })))
    .add(lights.studio())
});

const hero = app.nodes.require("hero");

// The controller takes an asset-shaped clip registry — wrap the typed asset
// like the fighting-game template does so `metadata` keeps its entries.
const heroClipRegistry = {
  id: assets.hero.id,
  name: assets.hero.id,
  url: assets.hero.url,
  hash: assets.hero.hash,
  metadata: { ...(assets.hero.metadata ?? {}) } as Record<string, unknown>
};

const controller = createAnimationController({
  id: "hero-animation",
  clipRegistry: heroClipRegistry,
  requiredClips: ["Idle", "Walk"],
  suppressRootMotion: true
});

// F-06-01 — clip drive: the binding plays GLB clips; there is no applyPose path.
controller.bindRuntimeNode(hero, { id: "hero-binding", defaultClipId: "Idle" });

let moving = false; // wired to your input/kinematic body each frame
app.onFrame(({ dt }) => {
  controller.crossFade(moving ? "Walk" : "Idle", 0.12);
  controller.update(dt);
});

// F-06-04 — tracksApplied > 0 means clip tracks bound; it is a precondition
// for motion, never a substitute for visually checking the animation.
void heroClips;
