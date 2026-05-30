/**
 * Prompt 09 — Animated Primitive Humanoid
 *
 * A humanoid figure assembled entirely from Aura3D primitives (sphere head,
 * box torso/limbs) that performs a procedural walk-cycle and strides back and
 * forth across a visible ground plane.
 *
 * The Aura3D public scene API (`scene`, `primitives`, `lights`, `camera`,
 * `createAuraApp`) describes a *static* snapshot: the engine builds primitive
 * meshes once from the snapshot and exposes no per-node animation hook (only
 * the camera and effects animate over time). To produce a real, articulated
 * walk-cycle we therefore recompute the full skeleton with forward kinematics
 * every animation frame and re-author the scene, swapping the rendered snapshot
 * in place on a single reused canvas. The result is genuine limb articulation
 * and locomotion, authored purely through the public API.
 */
import {
  createAuraApp,
  scene,
  primitives,
  lights,
  camera,
  type AuraApp,
  type AuraNodeBuilder,
  type AuraSceneNode,
  type AuraColor,
} from "@aura3d/engine";

type Node = AuraNodeBuilder<AuraSceneNode>;

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------
const COLORS = {
  background: "#243049" as AuraColor,
  ground: "#5b6680" as AuraColor,
  skin: "#e7b48c" as AuraColor,
  shirt: "#d4473d" as AuraColor,
  shorts: "#2f3c86" as AuraColor,
  shoe: "#23262e" as AuraColor,
  hair: "#3a2a22" as AuraColor,
};

// ---------------------------------------------------------------------------
// Skeleton proportions (metres). Figure stands ~1.7 m tall, feet at y = 0.
// ---------------------------------------------------------------------------
const THIGH_LEN = 0.42;
const SHIN_LEN = 0.42;
const UPPER_ARM_LEN = 0.3;
const FOREARM_LEN = 0.28;
const HIP_Y = THIGH_LEN + SHIN_LEN + 0.07; // ankle clearance
const HIP_HALF_WIDTH = 0.12;
const SHOULDER_Y = HIP_Y + 0.5;
const SHOULDER_HALF_WIDTH = 0.2;

// ---------------------------------------------------------------------------
// Gait parameters
// ---------------------------------------------------------------------------
const WALK_SPEED = 1.25; // metres / second of ground travel
const STRIDE_LENGTH = 1.05; // metres travelled per full leg cycle (2*pi)
const RANGE = 2.5; // figure paces back and forth within +/- RANGE on X

// A box limb segment plus the world-space position of its far (distal) joint.
interface Segment {
  node: Node;
  endX: number;
  endY: number;
}

/**
 * Place a box limb segment hanging from a joint and rotated about Z (the
 * sagittal / forward-back plane). `angle` is measured from straight-down; a
 * positive angle swings the distal end toward +X (local "forward"). `facing`
 * (+1 / -1) mirrors the figure across X so it can face its travel direction.
 * Returns the node and the world position of its far end so limbs can be
 * chained (hip -> knee -> ankle).
 */
function limb(
  jointX: number,
  jointY: number,
  jointZ: number,
  angle: number,
  length: number,
  thickness: number,
  color: AuraColor,
  facing: number,
): Segment {
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  const centerX = jointX + facing * (length / 2) * sin;
  const centerY = jointY - (length / 2) * cos;
  const node = primitives
    .box({
      size: [thickness, length, thickness],
      material: { color, roughness: 0.62, metallic: 0.02 },
    })
    .position(centerX, centerY, jointZ)
    .rotate(0, 0, facing * angle);
  return {
    node,
    endX: jointX + facing * length * sin,
    endY: jointY - length * cos,
  };
}

/** Build the complete scene snapshot for an absolute time in seconds. */
function buildScene(timeSeconds: number) {
  // --- Locomotion: pace back and forth across the ground plane ----------------
  const distance = timeSeconds * WALK_SPEED; // monotonic ground distance walked
  const span = 4 * RANGE;
  const u = ((distance % span) + span) % span;
  let rootX: number;
  let facing: number;
  if (u < 2 * RANGE) {
    rootX = -RANGE + u; // travelling toward +X
    facing = 1;
  } else {
    rootX = 3 * RANGE - u; // travelling back toward -X
    facing = -1;
  }

  // --- Gait phase synced to ground travel (no foot sliding) -------------------
  const phase = (distance / STRIDE_LENGTH) * Math.PI * 2;
  const swing = 0.62; // peak leg swing amplitude (radians)
  const armSwing = 0.5; // arms swing opposite the legs

  // Per-side leg angles (right side leads, left side trails by pi)
  const legAngleR = Math.sin(phase) * swing;
  const legAngleL = Math.sin(phase + Math.PI) * swing;
  // Knees flex (one direction only), peaking as each leg swings through
  const kneeR = Math.max(0, Math.cos(phase + 0.5)) * 0.95;
  const kneeL = Math.max(0, Math.cos(phase + Math.PI + 0.5)) * 0.95;
  // Arms counter-swing the legs
  const armAngleR = Math.sin(phase + Math.PI) * armSwing;
  const armAngleL = Math.sin(phase) * armSwing;
  const elbow = 0.35;

  // Vertical bob: body rises twice per stride
  const bob = 0.045 * (0.5 - 0.5 * Math.cos(phase * 2));
  const rootY = bob;
  const lean = 0.06; // slight forward torso lean

  const hipY = rootY + HIP_Y;
  const shoulderY = rootY + SHOULDER_Y;

  const nodes: Node[] = [];

  // --- Ground plane -----------------------------------------------------------
  nodes.push(
    primitives
      // Plane geometry is rotated flat onto X/Z, so size maps to [width, _, depth].
      .plane({ size: [200, 1, 200], material: { color: COLORS.ground, roughness: 0.96 } })
      .position(0, 0, 0),
  );

  // --- Legs (right then left) -------------------------------------------------
  for (const side of [1, -1] as const) {
    const isRight = side === 1;
    const legAngle = isRight ? legAngleR : legAngleL;
    const knee = isRight ? kneeR : kneeL;
    const hipZ = side * HIP_HALF_WIDTH;

    const thigh = limb(rootX, hipY, hipZ, legAngle, THIGH_LEN, 0.15, COLORS.shorts, facing);
    nodes.push(thigh.node);

    // Shin hangs from the knee; its absolute angle = thigh angle + knee flex.
    const shin = limb(thigh.endX, thigh.endY, hipZ, legAngle + knee, SHIN_LEN, 0.13, COLORS.skin, facing);
    nodes.push(shin.node);

    // Foot at the ankle, pointing in the travel direction.
    nodes.push(
      primitives
        .box({ size: [0.26, 0.09, 0.14], material: { color: COLORS.shoe, roughness: 0.5 } })
        .position(shin.endX + facing * 0.06, shin.endY + 0.045, hipZ),
    );
  }

  // --- Pelvis & torso ---------------------------------------------------------
  nodes.push(
    primitives
      .box({ size: [0.34, 0.18, 0.22], material: { color: COLORS.shorts, roughness: 0.6 } })
      .position(rootX, hipY + 0.02, 0),
  );
  const torsoCenterY = (hipY + shoulderY) / 2 + 0.02;
  nodes.push(
    primitives
      .box({
        size: [0.36, shoulderY - hipY + 0.06, 0.24],
        material: { color: COLORS.shirt, roughness: 0.66 },
      })
      .position(rootX + facing * lean * 0.5, torsoCenterY, 0)
      .rotate(0, 0, facing * -lean),
  );

  // --- Arms (right then left) -------------------------------------------------
  for (const side of [1, -1] as const) {
    const isRight = side === 1;
    const armAngle = isRight ? armAngleR : armAngleL;
    const shoulderZ = side * SHOULDER_HALF_WIDTH;

    const upper = limb(rootX, shoulderY, shoulderZ, armAngle, UPPER_ARM_LEN, 0.115, COLORS.shirt, facing);
    nodes.push(upper.node);

    const fore = limb(upper.endX, upper.endY, shoulderZ, armAngle + elbow, FOREARM_LEN, 0.1, COLORS.skin, facing);
    nodes.push(fore.node);
  }

  // --- Neck & head ------------------------------------------------------------
  nodes.push(
    primitives
      .box({ size: [0.1, 0.08, 0.1], material: { color: COLORS.skin, roughness: 0.6 } })
      .position(rootX + facing * lean * 0.7, shoulderY + 0.06, 0),
  );
  const headY = shoulderY + 0.22;
  nodes.push(
    primitives
      .sphere({ size: [0.27, 0.29, 0.27], material: { color: COLORS.skin, roughness: 0.55 } })
      .position(rootX + facing * lean * 0.9, headY, 0),
  );
  // Hair cap, nudged up and back.
  nodes.push(
    primitives
      .sphere({ size: [0.29, 0.24, 0.29], material: { color: COLORS.hair, roughness: 0.7 } })
      .position(rootX + facing * (lean * 0.9 - 0.03), headY + 0.06, 0),
  );

  // --- Lighting (key + warm fill, shadows on) ---------------------------------
  const root = scene()
    .background(COLORS.background)
    .add(lights.ambient({ intensity: 0.6, color: "#9fb4d6" }))
    .add(lights.directional({ position: [4, 7, 5], intensity: 1.5, color: "#fff4e6" }))
    .add(lights.directional({ position: [-5, 3, -3], intensity: 0.5, color: "#7fa8ff" }));

  for (const node of nodes) root.add(node);

  // Profile-leaning 3/4 camera, raised and tilted down so leg & arm swing, the
  // figure's X travel, and a generous expanse of ground plane are all visible.
  root.camera(camera.perspective({ position: [1.7, 2.35, 7.2], target: [0, 0.55, 0], fov: 44 }));

  return root;
}

// ---------------------------------------------------------------------------
// Runtime: drive the walk-cycle by re-authoring the scene each frame.
// ---------------------------------------------------------------------------
function mount() {
  const host = document.querySelector<HTMLElement>("#app");
  if (!host) throw new Error("missing #app host element");

  Object.assign(document.body.style, { margin: "0", overflow: "hidden", background: COLORS.background });
  Object.assign(host.style, { position: "fixed", inset: "0", width: "100vw", height: "100vh" });

  // Single canvas reused for the app's lifetime (no canvas churn).
  const canvas = document.createElement("canvas");
  Object.assign(canvas.style, { width: "100%", height: "100%", display: "block" });
  host.appendChild(canvas);

  const start = performance.now();
  let current: AuraApp | undefined;
  let previous: AuraApp | undefined;

  const frame = () => {
    const t = (performance.now() - start) / 1000;

    // Build the next frame's app, then dispose the one from two frames ago.
    // Keeping the immediately-previous app alive for one extra frame avoids any
    // blank gap while the new renderer initialises (preserveDrawingBuffer keeps
    // the last image until the fresh snapshot draws).
    const next = createAuraApp(canvas, { scene: buildScene(t), autoStart: false, resize: true });
    previous?.dispose();
    previous = current;
    current = next;

    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
}

mount();
