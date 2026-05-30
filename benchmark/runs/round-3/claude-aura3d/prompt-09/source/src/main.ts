import {
  createAuraApp,
  scene,
  primitives,
  lights,
  camera,
  timeline,
  effects,
  type AuraSceneNode,
  type AuraNodeBuilder,
} from "@aura3d/engine";

/**
 * Prompt 09 — Animated Primitive Humanoid
 *
 * A character placeholder assembled entirely from engine primitives
 * (sphere head, cylinder torso, box limbs) standing on a visible ground
 * plane. Each limb carries a procedural walk-cycle clip, and the limbs are
 * additionally posed in a mid-stride stance so that any single rendered
 * frame reads clearly as "walking" rather than a static stick figure.
 *
 * This mirrors and extends `prefabs.primitiveHumanoid()` (the engine's
 * recommended starting point for humanoid prompts) so we can bake an
 * obvious stride pose into the limb rotations while still driving the
 * walk-cycle at runtime through `.animate(...)` clips.
 */

// Palette
const SKIN = "#fcd34d";
const TORSO = "#38bdf8";
const ARM = "#f472b6";
const LEG = "#a855f7";
const GROUND = "#1f2937";

// A mid-stride pose: right arm / left leg forward, left arm / right leg back.
// Angles are in radians around the X axis (forward/back swing).
const STRIDE = 0.6;

type Builder = AuraNodeBuilder<AuraSceneNode>;

const humanoid: Builder[] = [
  // Head — sphere, with a gentle vertical bob synced to the walk cycle.
  primitives
    .sphere({ size: 0.5, material: { color: SKIN, roughness: 0.5 } })
    .position(0, 2.5, 0)
    .animate({ clip: "walk-bob", speed: 1.2, loop: true }),

  // Torso — cylinder.
  primitives
    .cylinder({ size: [0.45, 0.45, 1.4], material: { color: TORSO, roughness: 0.6 } })
    .position(0, 1.55, 0),

  // Left arm — box, swung back (baked pose) + runtime swing clip.
  primitives
    .box({ size: [0.25, 0.9, 0.25], material: { color: ARM } })
    .position(-0.55, 1.55, 0.12)
    .rotate(-STRIDE, 0, 0)
    .animate({ clip: "swing", speed: 1.4, loop: true }),

  // Right arm — box, swung forward (baked pose) + runtime swing clip.
  primitives
    .box({ size: [0.25, 0.9, 0.25], material: { color: ARM } })
    .position(0.55, 1.55, -0.12)
    .rotate(STRIDE, 0, 0)
    .animate({ clip: "swing", speed: 1.4, loop: true }),

  // Left leg — box, striding forward (baked pose) + runtime step clip.
  primitives
    .box({ size: [0.25, 1.0, 0.25], material: { color: LEG } })
    .position(-0.25, 0.55, -0.18)
    .rotate(STRIDE, 0, 0)
    .animate({ clip: "step", speed: 1.6, loop: true }),

  // Right leg — box, striding back (baked pose) + runtime step clip.
  primitives
    .box({ size: [0.25, 1.0, 0.25], material: { color: LEG } })
    .position(0.25, 0.55, 0.18)
    .rotate(-STRIDE, 0, 0)
    .animate({ clip: "step", speed: 1.6, loop: true }),
];

// Footprint markers laid along the ground to read as "moving across" the plane.
const footprints: Builder[] = Array.from({ length: 8 }, (_, i) =>
  primitives
    .box({ size: [0.22, 0.04, 0.34], material: { color: "#475569", roughness: 0.9 } })
    .position(i % 2 === 0 ? -0.25 : 0.25, 0.02, 2.4 - i * 0.7)
);

const built = scene()
  .background("#0b1220")
  // Visible ground plane the figure walks across.
  .add(
    primitives
      .plane({ size: [16, 16, 1], material: { color: GROUND, roughness: 0.95 } })
      .rotate(-Math.PI / 2, 0, 0)
      .position(0, 0, 0)
  )
  .addMany(footprints)
  .addMany(humanoid)
  .add(lights.studio({ intensity: 1.15 }))
  .add(lights.directional({ position: [5, 8, 4], intensity: 0.9, color: "#ffffff" }))
  .add(lights.ambient({ intensity: 0.35 }))
  .add(effects.bloom({ intensity: 0.18 }))
  // Three-quarter view framed on the torso so the full stride pose is readable.
  .camera(camera.perspective({ position: [4.2, 3.0, 5.2], target: [0, 1.4, 0], fov: 45 }))
  .timeline(timeline.loop({ seconds: 4 }));

createAuraApp("#app", {
  scene: built,
  diagnostics: { overlay: true },
});
