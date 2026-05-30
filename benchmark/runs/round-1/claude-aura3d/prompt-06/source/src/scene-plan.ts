// Mini-golf hole authored with the @aura3d/engine public API.
//
// The engine's public surface is declarative: scene()/primitives/lights/camera
// produce an AuraSceneSnapshot. That snapshot is the single source of truth for
// every position, size, colour and the camera framing in this app. The runtime
// (src/main.ts) realises this exact snapshot on the engine's own rendering
// substrate (Three.js) so the ball can be simulated with physics, aimed and
// shot by pointer, followed by the camera, and scored -- behaviours the
// declarative layer cannot express on its own.

import {
  scene,
  primitives,
  lights,
  camera,
  type AuraSceneSnapshot,
  type AuraVec3,
} from "@aura3d/engine";

// A loosely-typed positional/size tuple as it appears on snapshot nodes.
export type AuraVecLike = readonly number[];

// ---------------------------------------------------------------------------
// Layout (world units; +X right, +Y up, +Z toward the camera / tee)
// ---------------------------------------------------------------------------

export const LAYOUT = {
  // Putting green (a flat plane).
  green: {
    width: 9, // along X
    depth: 20, // along Z
    color: "#2f9e44",
  },
  // Low rails around the border that keep the ball in play.
  railHeight: 0.55,
  railThickness: 0.45,
  railColor: "#7a4a23",
  // The single obstacle: a block roughly mid-course that the ball must pass.
  obstacle: {
    size: [4.2, 1.1, 0.9] as AuraVec3,
    position: [0, 0.55, 0.5] as AuraVec3,
    color: "#c92a2a",
  },
  // Ball.
  ball: {
    radius: 0.34,
    color: "#f8f9fa",
    start: [0, 0.34, 8.2] as AuraVec3, // the tee
  },
  // Cup / hole the ball must be sunk into.
  hole: {
    position: [0, 0, -8.2] as AuraVec3,
    radius: 0.55,
    captureRadius: 0.62,
  },
  par: 3,
} as const;

// Inner half-extents of the playable surface (where the ball can roll),
// shrunk by the rail thickness and the ball radius.
export const BOUNDS = {
  minX: -LAYOUT.green.width / 2 + LAYOUT.railThickness + LAYOUT.ball.radius,
  maxX: LAYOUT.green.width / 2 - LAYOUT.railThickness - LAYOUT.ball.radius,
  minZ: -LAYOUT.green.depth / 2 + LAYOUT.railThickness + LAYOUT.ball.radius,
  maxZ: LAYOUT.green.depth / 2 - LAYOUT.railThickness - LAYOUT.ball.radius,
};

// ---------------------------------------------------------------------------
// Build the canonical scene snapshot through the public engine API.
// ---------------------------------------------------------------------------

function railNodes() {
  const { width, depth } = LAYOUT.green;
  const t = LAYOUT.railThickness;
  const h = LAYOUT.railHeight;
  const y = h / 2;
  const halfW = width / 2 - t / 2;
  const halfD = depth / 2 - t / 2;
  const mat = { color: LAYOUT.railColor, roughness: 0.85, metallic: 0 } as const;
  return [
    // left / right rails run the full depth
    primitives
      .box({ name: "rail-left", size: [t, h, depth], material: mat })
      .position(-halfW, y, 0),
    primitives
      .box({ name: "rail-right", size: [t, h, depth], material: mat })
      .position(halfW, y, 0),
    // near / far rails run the full width
    primitives
      .box({ name: "rail-far", size: [width, h, t], material: mat })
      .position(0, y, -halfD),
    primitives
      .box({ name: "rail-near", size: [width, h, t], material: mat })
      .position(0, y, halfD),
  ];
}

export function buildMiniGolfScene() {
  const rails = railNodes();
  const builder = scene()
    .background("#9fd2ff")
    // Putting green.
    .add(
      primitives
        .plane({
          name: "green",
          // size is (X, Y, Z) for every primitive; planes ignore Y.
          size: [LAYOUT.green.width, 1, LAYOUT.green.depth],
          material: { color: LAYOUT.green.color, roughness: 0.95, metallic: 0 },
        })
        .position(0, 0, 0),
    )
    // Border rails.
    .add(rails[0])
    .add(rails[1])
    .add(rails[2])
    .add(rails[3])
    // The one obstacle.
    .add(
      primitives
        .box({
          name: "obstacle",
          size: LAYOUT.obstacle.size,
          material: { color: LAYOUT.obstacle.color, roughness: 0.6, metallic: 0.05 },
        })
        .position(...LAYOUT.obstacle.position),
    )
    // The ball.
    .add(
      primitives
        .sphere({
          name: "ball",
          size: LAYOUT.ball.radius * 2,
          material: { color: LAYOUT.ball.color, roughness: 0.32, metallic: 0.04 },
        })
        .position(...LAYOUT.ball.start),
    )
    // Lighting: soft sky fill + a key light that casts shadows.
    .add(lights.ambient({ intensity: 0.55, color: "#dff0ff" }))
    .add(lights.directional({ position: [6, 12, 8], intensity: 1.15, color: "#fff6e6" }))
    // Follow camera that tracks the ball node.
    .camera(
      camera.follow({
        targetNode: "ball",
        position: [0, 6.5, 15],
        target: LAYOUT.ball.start,
        distance: 9,
        fov: 50,
      }),
    );

  return builder.toJSON();
}

export const SNAPSHOT: AuraSceneSnapshot = buildMiniGolfScene();
