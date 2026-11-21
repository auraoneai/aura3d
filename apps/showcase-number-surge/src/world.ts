/**
 * Number Surge world on the public `@aura3d/engine` surface: HDR AgX skyway lighting
 * (`lights.key` + `lights.hemisphere` + `environments.studio` softbox IBL, zero ambient),
 * deep midnight-violet `#0d0820` linear fog (`near >= 65, far >= 250`) + `neonBloom`,
 * paired GLSL 3.00 + WGSL holographic `frostedGateSpec` portals, `crystalWallSpec`
 * segmented boss walls, clearcoat hero core with curved `sphereCapMesh` inlay, glossy
 * and `sparks` flipbook bursts. (The value-evolution escort squad beside the ball was removed after owner review.)
 */
import {
  camera,
  effects,
  environments,
  geometry,
  group,
  instances,
  lights,
  material,
  model,
  primitives,
  scene,
  sky,
  texture,
  type AuraApp,
  type AuraTransformSpec
} from "@aura3d/engine";
import { createFlipbookAtlas } from "@aura3d/engine/game";
import { assets } from "./aura-assets.route";
import { labCameraOptions, readLabFlags } from "../../../examples/shared/lab-flags";
import {
  Batch,
  CORRIDOR_BOUNDS,
  Slots,
  scrollFrameZ,
  flatSpec,
  gradientSkyOptions,
  shadowSpec,
  skySpec,
  gradientSkyFragment,
  toonSpec,
  hexToLinear,
  type CustomSpec,
  type MeshData,
  type Rgb
} from "../../../examples/shared/runner-kit/index";
import {
  SURGE_MATERIALS,
  bossWallSawRollerHazardMeshData,
  buildHazardBuzzsawSpec,
  buildHeroSurgeBallNode,
  highwayGateGantryFrameMeshData,
  powerupMedallionMeshData
} from "./art/proceduralModels";
import { CONFIG, opLabel, type BossWall, type Gate, type NumberSurgeSim, type Powerup } from "./sim";
import {
  DIMS,
  gatePanelMesh,
  groundQuad,
  opLabelMesh,
  particleMesh,
  quadMesh,
  roadDashMesh,
  roadEdgeMesh,
  roadSegmentMesh,
  shardMesh,
  shadowMesh,
  sphereCapMesh,
  sphereMesh,
  wallLabelMesh
} from "./meshes";
import { BROADCAST_CRISP_LUT, LINEAR, LOOK, SKY_STOPS } from "./look";
import type { Shown } from "./presentation";
import { addRoadside } from "./roadside";
import {
  addScenery,
  crystalWallSpec,
  deckSpec,
  frostedGateSpec,
  hexShieldSpec,
  sceneryProgramSpecs,
  sparksFlipbookSpec,
  stanchionSpec,
  stripSpec,
  synthSkySpec
} from "./scenery";
import { LABEL_FRAGMENT_WGSL, UV_VERTEX_WGSL } from "./scenery-wgsl";

type Scene = ReturnType<typeof scene>;
type TextureHandle = ReturnType<typeof texture.canvas>;
type NodeHandle = ReturnType<AuraApp["nodes"]["require"]>;

const f32 = (a: readonly number[]): Float32Array => Float32Array.from(a);

function dynamicFrom(m: MeshData) {
  return geometry.dynamic({ positions: f32(m.positions), normals: f32(m.normals), uvs: f32(m.uvs), indices: Uint32Array.from(m.indices) });
}

const KEY_POS: readonly [number, number, number] = [-14, 24, 16];
const KEY_TARGET: readonly [number, number, number] = [0, 0, -12];
const KEY_SUN_DIR: Rgb = (() => {
  const dx = KEY_POS[0] - KEY_TARGET[0];
  const dy = KEY_POS[1] - KEY_TARGET[1];
  const dz = KEY_POS[2] - KEY_TARGET[2];
  const len = Math.hypot(dx, dy, dz) || 1;
  return [dx / len, dy / len, dz / len];
})();

/**
 * Idol wow pass: rigged Idol bodies ship in Idol's raw frame (1 m tall, centred on the origin, facing +X; an
 * un-normalised skeleton keeps the skin check honest), so each slot scales the body to the procedural figure's
 * height, grounds it and turns +X to the slot's facing. Clip lengths from `assets inspect`.
 */
const IDOL_RIG = { guard: 1.31 } as const;
const IDOL_FACE_PLUS_Z = -Math.PI / 2;

function idolRiggedSlot(id: string, asset: typeof assets.nsGuardRig, height: number, faceYaw: number) {
  return group(id, [
    model(asset, { name: `${id}-body`, scaleMode: "world", castShadow: true, receiveShadow: true })
      .position(0, height / 2, 0)
      .rotation(0, faceYaw, 0)
      .scale(height)
      .runtime({ id: `${id}-body` })
  ]).position(0, -40, -60).scale(0.001).runtime({ id });
}

/** Writes per-slot transforms (the old instanced-pool scratch) to the slot group nodes; parked slots are hidden. */
function applyIdolSlots(node: (id: string) => NodeHandle, prefix: string, scratch: readonly MutableCrowdTransform[]): void {
  for (let i = 0; i < scratch.length; i++) {
    const t = scratch[i]!;
    const shown = t.scale > 0.01;
    const h = node(`${prefix}-${i}`).setVisible(shown);
    if (shown) h.setPosition(t.position[0], t.position[1], t.position[2]).setRotation(t.rotation[0], t.rotation[1], t.rotation[2]).setScale(t.scale);
  }
}

/* ------------------------------------------------------------ contact geometry (visual == sim hitbox) */

/**
 * The sim has no lateral colliders: a gate row resolves when it reaches the ball plane (z = 0) and a boss wall resolves
 * (smash / shield block / burst) when `wall.z` reaches 0 across the whole road. So the world keeps every solid gate part
 * outside the ball's lateral sweep (`|x| <= LANE_LIMIT + BALL_RADIUS`) and draws the boss-wall assembly
 * `wallVisualLead(shield)` beyond the sim plane, so its frontmost solid (the riot guards) touches the ball's front, or
 * the shield bubble's, on exactly the step the sim resolves the wall: the ball stops against it instead of sinking in.
 */
/** Gate gantries keep only their outer stanchion (`highwayGateGantryFrameMeshData([-1])`); the +x gate is yawed by pi. */
export const GATE_FRAME_SIDES: readonly (-1 | 1)[] = [-1];
export const gateFrameYaw = (gateX: number): number => (gateX > 0 ? Math.PI : 0);
export const SHIELD_RADIUS = 0.96;
/** Flank buzzsaws on the boss wall (`buildHazardBuzzsawSpec`, r 0.86, half depth 0.09). */
export const WALL_SAW = { x: 2.86, y: 1.82, z: 0.34, halfDepth: 0.09 } as const;
/** Two flanking Heavy Riot Guards + one central Giant Riot Captain standing in front of each boss wall. */
export const BOSS_GUARDS = [
  { x: -1.86, z: 0.54, scale: 0.98, yaw: 0.14 },
  { x: 0, z: 0.62, scale: 1.18, yaw: 0 },
  { x: 1.86, z: 0.54, scale: 0.98, yaw: -0.14 }
] as const;
export const GUARD_SWAY = 0.055;
/** nsGuardRig raw half extents (`assets/idol/nsGuardRig.idol.json` rawBounds; faces +X, so depth is raw X, T-pose span raw Z). */
export const GUARD_RAW_HALF = { depth: 0.129, span: 0.501 } as const;
/** Frontmost (+z) point of the `walls` batch mesh (flank bearing wheels; pinned against the mesh by the contact test). */
export const WALL_MESH_FRONT = 0.52;

/** Frontmost (+z) reach of one guard about the wall origin at its widest sway (body depth plus yawed T-pose arm span). */
export function guardFrontZ(g: (typeof BOSS_GUARDS)[number]): number {
  const yaw = Math.abs(g.yaw) + GUARD_SWAY;
  const s = g.scale * IDOL_RIG.guard;
  return g.z + s * (GUARD_RAW_HALF.depth * Math.cos(yaw) + GUARD_RAW_HALF.span * Math.sin(yaw));
}

/** Frontmost solid of the whole boss-wall assembly (wall mesh, saws, guards) about the wall origin. */
export const WALL_ASSEMBLY_FRONT = Math.max(WALL_MESH_FRONT, WALL_SAW.z + WALL_SAW.halfDepth, ...BOSS_GUARDS.map(guardFrontZ));

/** How far beyond the sim's wall plane the assembly is drawn so its front meets the ball (or shield) front at `wall.z = 0`. */
export const wallVisualLead = (shield: boolean): number => WALL_ASSEMBLY_FRONT + (shield ? SHIELD_RADIUS : DIMS.BALL_RADIUS);

/**
 * Drawn z of a boss wall's origin (`back` = presentation step-back, or `o.distance` for run space). The sim wall z is
 * clamped at its resolve plane: on a failed wall the run freezes a fraction of a step past z = 0, and the wall must
 * stay in contact with the ball rather than slide over it.
 */
export const wallWorldZ = (simWallZ: number, back: number, shield: boolean): number =>
  -(Math.max(0, simWallZ) + back) - wallVisualLead(shield);

/* ------------------------------------------------------------ canvas-text label program (game-specific GLSL) */

export const LABEL_VERTEX = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

export const LABEL_FRAGMENT = /* glsl */ `
in vec2 vUv;
out vec4 outColor;
void main() {
  vec4 t = texture(map, vUv);
  vec3 lin = mix(t.rgb / 12.92, pow((t.rgb + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), t.rgb));
  outColor = vec4(baseColor * lin, alpha * t.a);
}`;

export const labelSpec = (map: TextureHandle): CustomSpec => ({
  glsl: { vertex: LABEL_VERTEX, fragment: LABEL_FRAGMENT },
  wgsl: { vertex: UV_VERTEX_WGSL, fragment: LABEL_FRAGMENT_WGSL },
  uniforms: {
    map: { type: "texture2d", value: map },
    baseColor: { type: "color3", value: [1, 1, 1] },
    alpha: { type: "f32", value: 1 }
  },
  transparent: true,
  depthWrite: false,
  side: "double"
});

/** One of each distinct program, so a unit test can compile exactly what the app draws with. */
export const allProgramSpecs = (): readonly { readonly name: string; readonly spec: CustomSpec }[] => [
  { name: "toon", spec: toonSpec([0.5, 0.5, 0.5]) },
  { name: "toon-tone", spec: toonSpec([1, 1, 1], undefined, [0, 0, 0], true) },
  { name: "flat", spec: flatSpec([1, 1, 1], 0.9) },
  { name: "flat-tone", spec: flatSpec([1, 1, 1], 1, true) },
  { name: "shadow", spec: shadowSpec() },
  { name: "sky", spec: skySpec(gradientSkyFragment(SKY_STOPS)) },
  { name: "label", spec: labelSpec(texture.data({ width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255]) }) as unknown as TextureHandle) },
  ...sceneryProgramSpecs()
];

/* ------------------------------------------------------------ canvas painters */

function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext("2d");
    if (g) return { canvas, g };
  }
  const g = {
    canvas: null as unknown as HTMLCanvasElement,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineJoin: "round" as CanvasLineJoin,
    textAlign: "center" as CanvasTextAlign,
    textBaseline: "middle" as CanvasTextBaseline,
    font: "",
    clearRect: () => undefined,
    fillText: () => undefined,
    strokeText: () => undefined
  } as unknown as CanvasRenderingContext2D;
  const canvas = { width: w, height: h, getContext: () => g } as unknown as HTMLCanvasElement;
  (g as unknown as { canvas: HTMLCanvasElement }).canvas = canvas;
  return { canvas, g };
}

/** Op label: crisp high-contrast DIN Pro white text with deep midnight-violet keyline on transparent ground. */
export function paintOpLabel(g: CanvasRenderingContext2D, text: string): void {
  const { width: w, height: h } = g.canvas;
  g.clearRect(0, 0, w, h);
  g.textAlign = "center";
  g.textBaseline = "middle";
  const size = text.length > 3 ? 90 : 112;
  g.font = `600 ${size}px "DIN Pro", "Whitney", sans-serif`;
  g.lineJoin = "round";
  g.lineWidth = 14;
  g.strokeStyle = "#08061c";
  g.strokeText(text, w / 2, h / 2 + 4);
  g.fillStyle = "#ffffff";
  g.fillText(text, w / 2, h / 2 + 4);
}

/** Curved ball number inlay: luminous white-cyan DIN Pro numerals with crisp dark indigo edge stroke. */
export function paintNumber(g: CanvasRenderingContext2D, value: number): void {
  const { width: w, height: h } = g.canvas;
  g.clearRect(0, 0, w, h);
  const text = String(value);
  g.textAlign = "center";
  g.textBaseline = "middle";
  const size = text.length <= 2 ? 124 : text.length <= 4 ? 92 : 66;
  g.font = `500 ${size}px "DIN Pro", "Whitney", sans-serif`;
  g.lineJoin = "round";
  g.lineWidth = 12;
  g.strokeStyle = "#0a102b";
  g.strokeText(text, w / 2, h / 2 + 4);
  g.fillStyle = "#f4fbff";
  g.fillText(text, w / 2, h / 2 + 4);
}

/** Boss wall HP: DIN Pro cost readout + live SMASH / DANGER caption. */
export function paintWallHp(g: CanvasRenderingContext2D, hp: number, canSmash = false): void {
  const { width: w, height: h } = g.canvas;
  g.clearRect(0, 0, w, h);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineJoin = "round";
  g.font = `500 108px "DIN Pro", "Whitney", sans-serif`;
  g.lineWidth = 12;
  g.strokeStyle = "rgba(12, 8, 30, 0.9)";
  g.strokeText(String(hp), w / 2, h / 2 - 14);
  g.fillStyle = canSmash ? "#ffe26a" : "#ff708d";
  g.fillText(String(hp), w / 2, h / 2 - 14);
  g.font = `600 34px "Whitney", sans-serif`;
  g.lineWidth = 8;
  const caption = canSmash ? "SMASH" : "DANGER";
  g.strokeText(caption, w / 2, h / 2 + 54);
  g.fillStyle = canSmash ? "#7dff9e" : "#eaf6ff";
  g.fillText(caption, w / 2, h / 2 + 54);
}

/* ------------------------------------------------------------ build */

export interface WorldOptions {
  readonly sim: NumberSurgeSim;
  readonly aspect: number;
  readonly look?: typeof LOOK;
}

export interface WorldView {
  readonly shown?: Shown;
  readonly reducedMotion?: boolean;
  /** Milestone / impact FOV punch in degrees (presentation only; 0 on reduced motion). */
  readonly fovPunch?: number;
  /** Real-time camera trauma offset from ImpactRig. */
  readonly shakeOffset?: readonly [number, number, number];
  /** Real-time camera trauma roll in radians from ImpactRig. */
  readonly shakeRoll?: number;
}

export interface WorldRuntime {
  update(sim: NumberSurgeSim, aspect: number, view?: WorldView): void;
  warm(on: boolean): void;
  readonly nodeCount: number;
  readonly uploadedVertices: number;
}

export interface World {
  readonly scene: Scene;
  bind(app: AuraApp): WorldRuntime;
}

export const BATCH_IDS = ["deck", "edges", "dashes", "gate-panels", "gate-frames", "walls", "powerups", "particles", "shards"] as const;
const SCROLL_BATCH_IDS = ["deck", "edges", "dashes", "gate-panels", "gate-frames", "walls", "powerups"] as const;

const POWERUP_TONES: Record<Powerup["kind"], Rgb> = {
  plus25: LINEAR.powerup,
  double: LINEAR.powerup,
  shield: LINEAR.shield,
  x2: LINEAR.powerup
};

const toneCache = new Map<string, Rgb>();
const toneOf = (hex: string): Rgb => {
  let t = toneCache.get(hex);
  if (!t) toneCache.set(hex, (t = hexToLinear(hex)));
  return t;
};

interface MutableCrowdTransform extends AuraTransformSpec {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
}

const parkedTransforms = (count: number): MutableCrowdTransform[] =>
  Array.from({ length: count }, () => ({
    position: [0, -40, -60] as [number, number, number],
    rotation: [0, 0, 0] as [number, number, number],
    scale: 0.001
  }));

export function buildWorld(options: WorldOptions): World {
  const look = options.look ?? LOOK;
  void BROADCAST_CRISP_LUT;
  const builder: Scene = scene()
    .background(look.background)
    .camera(
      camera.perspective({
        ...labCameraOptions(readLabFlags(), "reversed"),
        position: [0, LOOK.camera.height, LOOK.camera.back],
        target: [0, 1, LOOK.camera.lookAheadZ],
        fov: LOOK.camera.fovDeg,
        near: 0.1,
        far: 420
      })
    );

  const add = (id: string, mesh: MeshData, spec: CustomSpec): void => {
    builder.add(geometry.custom(dynamicFrom(mesh), { name: id, material: material.custom(spec) }).runtime({ id }));
  };
  const addBatch = (id: string, batch: Batch, spec: CustomSpec, shadow = false): void => {
    builder.add(
      geometry
        .custom(batch.geometry(), { name: id, castShadow: shadow, receiveShadow: shadow, material: material.custom(spec) })
        .runtime({ id })
    );
  };

  // 5.7.2 stylized dusk corridor sky.gradient via runner-kit `gradientSkyOptions` + synthwave skyway dome.
  builder.add(
    sky.gradient({
      name: "ns-gradient-sky",
      ...gradientSkyOptions(look.skyStops, { haze: { intensity: 0.16 }, dither: true })
    })
  );
  add("sky", sphereMesh(360, 48, 24), synthSkySpec());

  // Studio skyway lighting rig: 1 shadowed key with 5.7.2 `softness: 2.0` + corridor `shadow.fit` + hemisphere + studio IBL.
  builder
    .add(
      lights.key({
        name: "skyway-key",
        position: [...KEY_POS],
        target: [...KEY_TARGET],
        color: "#ffe6c8",
        intensity: 2.8,
        shadow: {
          cascades: 1,
          maxDistance: 68,
          mapSize: 1024,
          softness: 2.0,
          fit: { center: [0, 0, -16], extent: 18, depth: 52 }
        }
      })
    )
    .add(lights.hemisphere({ name: "skyway-hemi", skyColor: "#6e7bff", groundColor: "#0d0820", intensity: 0.5 }))
    .add(environments.studio({ name: "skyway-ibl", preset: "softbox", intensity: 0.72, background: false }));

  // Corridor batches with tight CORRIDOR_BOUNDS frustum/shadow bounds (rebased every 120 m of travel).
  const deck = new Batch(roadSegmentMesh(), CONFIG.SEGMENTS, null, CORRIDOR_BOUNDS);
  const edges = new Batch(roadEdgeMesh(), CONFIG.SEGMENTS, null, CORRIDOR_BOUNDS);
  const dashes = new Batch(roadDashMesh(), CONFIG.SEGMENTS, null, CORRIDOR_BOUNDS);
  addBatch("deck", deck, deckSpec(LINEAR.road, LINEAR.roadStripe, KEY_SUN_DIR), true);
  addBatch("edges", edges, stripSpec(LINEAR.roadEdge, 1.95, 0.95));
  addBatch("dashes", dashes, stripSpec(LINEAR.roadStripe, 1.65, 0.85));

  // Wet-lane glossy specular reflection strips down the dusk corridor so cyan/magenta gates reflect along both lanes.
  const wetStripMat = material.clearcoatPaint({
    name: "ns-wet-lane-specular",
    color: "#151238",
    roughness: 0.12,
    metallic: 0.1,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
    envMapIntensity: 1.55,
    alphaMode: "blend",
    opacity: 0.34,
    depthWrite: false
  });
  for (const laneX of CONFIG.GATE_LANES) {
    builder.add(
      primitives.plane({
        name: `wet-lane-${laneX < 0 ? "l" : "r"}`,
        size: [2.25, 1, 170],
        position: [laneX, 0.012, -74],
        material: wetStripMat,
        castShadow: false,
        receiveShadow: true
      })
    );
  }

  // Refractive holographic gate panels + lattice-truss alloy math-gate gantries + dual-coded silhouette caps:
  // upward bright chevron caps on `+`/`×` gates vs jagged crimson hazard bars on `−`/`÷` gates.
  const panels = new Batch(gatePanelMesh(), CONFIG.GATES, LINEAR.gateGood, CORRIDOR_BOUNDS);
  const frames = new Batch(highwayGateGantryFrameMeshData(GATE_FRAME_SIDES), CONFIG.GATES, LINEAR.gateFrame, CORRIDOR_BOUNDS);
  addBatch("gate-panels", panels, frostedGateSpec());
  addBatch("gate-frames", frames, stanchionSpec(KEY_SUN_DIR), true);
  builder.add(
    instances.cone({
      name: "gate-good-caps",
      size: [0.55, 0.34, 0.22],
      material: material.emissive({ color: "#3ef2ff", emissive: "#5cf7ff", emissiveIntensity: 1.65, roughness: 0.2 }),
      transforms: parkedTransforms(CONFIG.GATES),
      castShadow: false,
      receiveShadow: false
    }).runtime({ id: "gate-good-caps" })
  );
  builder.add(
    instances.box({
      name: "gate-bad-hazards",
      size: [2.5, 0.16, 0.18],
      material: material.emissive({ color: "#ff335a", emissive: "#ff2d55", emissiveIntensity: 1.75, roughness: 0.25 }),
      transforms: parkedTransforms(CONFIG.GATES * 2),
      castShadow: false,
      receiveShadow: false
    }).runtime({ id: "gate-bad-hazards" })
  );

  const opCanvases = Array.from({ length: CONFIG.GATES }, () => makeCanvas(256, 160));
  const opTextures = opCanvases.map(({ canvas }) => texture.canvas({ canvas, colorSpace: "linear" }));
  for (let i = 0; i < CONFIG.GATES; i++) {
    paintOpLabel(opCanvases[i]!.g, "+5");
    add(`op-label-${i}`, opLabelMesh(), labelSpec(opTextures[i]!));
  }

  // Multi-material clearcoat hero core + brushed-alloy gyro bands + curved spherical-cap numeral inlay + hex-Fresnel barrier.
  builder.add(buildHeroSurgeBallNode(DIMS.BALL_RADIUS));
  const numberCanvas = makeCanvas(256, 256);
  paintNumber(numberCanvas.g, CONFIG.START_NUMBER);
  const numberTexture = texture.canvas({ canvas: numberCanvas.canvas, colorSpace: "linear" });
  add("ball-label", sphereCapMesh(DIMS.BALL_RADIUS + 0.018, 0.72, 18), labelSpec(numberTexture));
  add("ball-shadow", shadowMesh(), shadowSpec());
  add("shield", sphereMesh(SHIELD_RADIUS, 24, 16), hexShieldSpec(LINEAR.shield));

  // Segmented crystal-masonry + crusher-roller boss walls, spinning flank buzzsaws & crimson-and-obsidian Heavy Riot Guards.
  const walls = new Batch(bossWallSawRollerHazardMeshData(), CONFIG.WALLS, LINEAR.wall, CORRIDOR_BOUNDS);
  addBatch("walls", walls, crystalWallSpec(KEY_SUN_DIR), true);
  builder
    .add(
      instances
        .custom(buildHazardBuzzsawSpec(), {
          name: "hazard-saws",
          castShadow: false,
          receiveShadow: false,
          material: SURGE_MATERIALS.sawBladeSteel,
          transforms: parkedTransforms(CONFIG.WALLS * 2)
        })
        .runtime({ id: "hazard-saws" })
    )
    ;
  // Idol wow pass: rigged Idol heavy riot guards (`boss-guards-<i>`) playing their Idol idle clip, facing +Z toward the
  // oncoming squad like the procedural guards.
  for (let i = 0; i < CONFIG.WALLS * 3; i++) builder.add(idolRiggedSlot(`boss-guards-${i}`, assets.nsGuardRig, IDOL_RIG.guard, IDOL_FACE_PLUS_Z));
  const wallCanvases = Array.from({ length: CONFIG.WALLS }, () => makeCanvas(384, 208));
  const wallTextures = wallCanvases.map(({ canvas }) => texture.canvas({ canvas, colorSpace: "linear" }));
  for (let i = 0; i < CONFIG.WALLS; i++) {
    paintWallHp(wallCanvases[i]!.g, 50, false);
    add(`wall-label-${i}`, wallLabelMesh(), labelSpec(wallTextures[i]!));
  }

  const powerups = new Batch(powerupMedallionMeshData(), CONFIG.POWERUPS, LINEAR.powerup, CORRIDOR_BOUNDS);
  addBatch("powerups", powerups, toonSpec([1, 1, 1], undefined, [0.1, 0.08, 0.0], true));

  const particles = new Batch(particleMesh(), CONFIG.PARTICLES, [1, 1, 1], CORRIDOR_BOUNDS);
  addBatch("particles", particles, flatSpec([1, 1, 1], 1, true));
  const shards = new Batch(shardMesh(), CONFIG.SHARDS, LINEAR.shard, CORRIDOR_BOUNDS);
  addBatch("shards", shards, toonSpec([1, 1, 1], undefined, [0.05, 0.02, 0.1], true));

  // Procedural `createFlipbookAtlas("sparks" | "plasma")` + live `effects.flipbook({ texture })` for boss smashes + cyan speed ribbon.
  const sparksAtlas = createFlipbookAtlas("sparks", [255, 220, 118]);
  const smashPlasmaAtlas = createFlipbookAtlas("plasma", [255, 198, 72]);
  add("sparks-burst", quadMesh(2.9, 2.9), sparksFlipbookSpec(sparksAtlas.texture, sparksAtlas.columns, sparksAtlas.rows));
  builder.add(
    effects.flipbook({
      name: "smash-flipbook-sparks",
      texture: sparksAtlas.texture,
      spriteColumns: sparksAtlas.columns,
      spriteRows: sparksAtlas.rows,
      frameRate: 34,
      loop: false,
      size: 2.6,
      color: "#ffd84d",
      blend: "additive"
    }).position(0, -50, -60).runtime({ id: "smash-flipbook-sparks" })
  );
  builder.add(
    effects.flipbook({
      name: "smash-flipbook-plasma",
      texture: smashPlasmaAtlas.texture,
      spriteColumns: smashPlasmaAtlas.columns,
      spriteRows: smashPlasmaAtlas.rows,
      frameRate: 30,
      loop: false,
      size: 3.1,
      color: "#ff9d3b",
      blend: "additive"
    }).position(0, -50, -60).runtime({ id: "smash-flipbook-plasma" })
  );
  builder.add(
    effects.trail({
      name: "ball-trail",
      target: "ball",
      color: "#3ef2ff",
      intensity: 1.1,
      width: 0.38,
      maxPoints: 32,
      minVertexDistance: 0.06
    })
  );

  // Ground plane under the grid floor in deep midnight-violet so the horizon never shows grey washout.
  add("underlay", groundQuad(240, 480, 0, -15, -120), toonSpec(hexToLinear("#0d0820")));

  const scenery = addScenery(builder);
  // GPU-instanced procedural roadside dressing (sleek low-profile side-curbs <= 0.35 m, outboard cyber-palms, sevens & dice).
  const roadside = addRoadside(builder);

  // Deep midnight-violet linear fog (near >= 65, far >= 250, #0d0820) + mobile-friendly HDR neon post-stack.
  builder
    .add(
      effects.fog({
        name: "skyway-fog",
        mode: "linear",
        near: look.fog.near,
        far: look.fog.far,
        color: look.fog.color,
        density: look.fog.density,
        affectsBackground: false,
        maxOpacity: 0.85
      })
    )
    .add(effects.neonBloom({ intensity: 0.44, color: "#ff4fd8", threshold: 0.78, radius: 0.4 }))
    .add(effects.colorGrade({ name: "grade", contrast: 1.08, saturation: 1.1, vibrance: 0.08, temperature: -0.02, gain: 1.03 }))
    .add(effects.vignette({ name: "vignette", intensity: 0.22, color: "#0d0820" }));

  return {
    scene: builder,
    bind(app: AuraApp): WorldRuntime {
      const handles = new Map<string, NodeHandle>();
      const node = (id: string): NodeHandle => {
        let h = handles.get(id);
        if (!h) handles.set(id, (h = app.nodes.require(id)));
        return h;
      };
      const maybeController = app.camera;
      if (!maybeController) throw new Error("number-surge: the app exposes no camera controller");
      const controller: NonNullable<typeof maybeController> = maybeController;

      const sceneryRuntime = scenery.bind(app, node);
      const roadsideRuntime = roadside.bind(node);
      const gateSlots = new Slots<Gate>(CONFIG.GATES);
      const wallSlots = new Slots<BossWall>(CONFIG.WALLS);
      const powerupSlots = new Slots<Powerup>(CONFIG.POWERUPS);
      const gateRunZ = new Float64Array(CONFIG.GATES).fill(Number.NaN);
      const gateText = new Array<string>(CONFIG.GATES).fill("");
      const wallRunZ = new Float64Array(CONFIG.WALLS).fill(Number.NaN);
      const wallText = new Array<string>(CONFIG.WALLS).fill("");
      const powerupRunZ = new Float64Array(CONFIG.POWERUPS).fill(Number.NaN);
      const powerupKind = new Array<string>(CONFIG.POWERUPS).fill("");
      const segmentJ = new Array<number>(CONFIG.SEGMENTS).fill(Number.NaN);
      const hazardSawScratch = parkedTransforms(CONFIG.WALLS * 2);
      const bossGuardScratch = parkedTransforms(CONFIG.WALLS * 3);
      const goodCapScratch = parkedTransforms(CONFIG.GATES);
      const badHazardScratch = parkedTransforms(CONFIG.GATES * 2);

      let roadAnchor = 0;
      let lastNumber = -1;
      let lastShield = false;
      let lastBurstEvents = -1;
      let lastSmashEvents = -1;
      let burstStartTime = -10;
      let burstX = 0;
      let burstTint: Rgb = [1.4, 1.15, 0.55];
      let prevLaneX = 0;
      let prevTime = 0;
      let laneBank = 0;

      // Touch every node once so nodeCount and warm() cover the full set.
      for (const id of BATCH_IDS) node(id);
      node("sky");
      node("ball");
      node("ball-label");
      node("ball-shadow");
      node("hazard-saws");
      // Idol clips (engine pose mixer; main.ts steps the app by frame time): staggered run phases for the squad,
      // idle for the guards.
      for (let i = 0; i < CONFIG.WALLS * 3; i++) {
        node(`boss-guards-${i}`);
        node(`boss-guards-${i}-body`).setAnimation({ clip: "idle", loop: true, speed: 1, duration: 2.533, startTime: (i * 0.71) % 2.533 });
      }
      node("sparks-burst").setVisible(false);
      node("smash-flipbook-sparks").setVisible(false);
      node("smash-flipbook-plasma").setVisible(false);
      node("gate-good-caps");
      node("gate-bad-hazards");
      node("underlay");
      node("shield").setVisible(false);
      for (let i = 0; i < CONFIG.GATES; i++) node(`op-label-${i}`).setVisible(false);
      for (let i = 0; i < CONFIG.WALLS; i++) node(`wall-label-${i}`).setVisible(false);

      function update(sim: NumberSurgeSim, aspect: number, view: WorldView = {}): void {
        const o = sim.o;
        const distance = view.shown?.distance ?? o.distance;
        const back = view.shown?.back ?? 0;
        const laneX = view.shown?.laneOffset ?? o.laneOffset;
        const travelled = distance - back;
        const scroll = -travelled;
        const time = view.shown?.time ?? o.time;

        // Keep local vertex Z strictly inside CORRIDOR_BOUNDS [-420, 60] across arbitrarily long runs.
        if (Math.abs(scroll - roadAnchor) > 120) {
          roadAnchor = scroll;
          segmentJ.fill(Number.NaN);
          gateRunZ.fill(Number.NaN);
          wallRunZ.fill(Number.NaN);
          powerupRunZ.fill(Number.NaN);
        }
        const frameZ = roadAnchor - scroll;

        sceneryRuntime.update(travelled, time);
        roadsideRuntime.update(travelled, time);

        /* road ring: segment j sits at run-space z = j * SEGMENT_LENGTH (local z = runZ - roadAnchor). */
        const jStart = Math.floor(scroll / DIMS.SEGMENT_LENGTH) - (CONFIG.SEGMENTS - 10);
        for (let j = jStart; j < jStart + CONFIG.SEGMENTS; j++) {
          const slot = ((j % CONFIG.SEGMENTS) + CONFIG.SEGMENTS) % CONFIG.SEGMENTS;
          if (segmentJ[slot] === j) continue;
          segmentJ[slot] = j;
          const z = scrollFrameZ(j * DIMS.SEGMENT_LENGTH, roadAnchor);
          deck.place(slot, 0, 0, z, 0, 1, 1, 1);
          edges.place(slot, 0, 0.02, z, 0, 1, 1, 1);
          dashes.place(slot, 0, 0.02, z, 0, 1, 1, 1);
        }

        /* holographic gates + beveled chrome stanchions + dual-coded arch caps */
        const liveGates = o.gates.filter((g) => g.active && !o.rows[g.row]?.resolved);
        for (let i = 0; i < CONFIG.GATES; i += 1) {
          const gc = goodCapScratch[i]!;
          gc.position[0] = 0; gc.position[1] = -40; gc.position[2] = -60; gc.scale = 0.001;
          for (let k = 0; k < 2; k += 1) {
            const bh = badHazardScratch[i * 2 + k]!;
            bh.position[0] = 0; bh.position[1] = -40; bh.position[2] = -60; bh.scale = 0.001;
          }
        }
        gateSlots.retain(liveGates, (slot) => {
          panels.collapse(slot);
          frames.collapse(slot);
          gateRunZ[slot] = Number.NaN;
          gateText[slot] = "";
          node(`op-label-${slot}`).setVisible(false);
        });
        for (const gate of liveGates) {
          const { slot, fresh } = gateSlots.use(gate);
          if (slot < 0) continue;
          const runZ = -(gate.z + o.distance);
          const negative = gate.kind === "sub" || gate.kind === "div2";
          if (fresh || gateRunZ[slot] !== runZ) {
            gateRunZ[slot] = runZ;
            const z = scrollFrameZ(runZ, roadAnchor);
            panels.place(slot, gate.x, 0, z, 0, 1, 1, 1);
            frames.place(slot, gate.x, 0, z, gateFrameYaw(gate.x), 1, 1, 1);
            const bright = negative ? LINEAR.gateBad : LINEAR.gateGood;
            panels.setTone(slot, bright);
            frames.setTone(slot, bright);
          }
          const worldGateZ = -(gate.z + back);
          if (negative) {
            // Jagged crimson double-chevron hazard bars across the arch header (high above the ball).
            const bhA = badHazardScratch[slot * 2]!;
            const bhB = badHazardScratch[slot * 2 + 1]!;
            bhA.position[0] = gate.x; bhA.position[1] = 2.86; bhA.position[2] = worldGateZ + 0.08;
            bhA.rotation[0] = 0; bhA.rotation[1] = 0; bhA.rotation[2] = 0.14; bhA.scale = 1;
            bhB.position[0] = gate.x; bhB.position[1] = 2.86; bhB.position[2] = worldGateZ + 0.08;
            bhB.rotation[0] = 0; bhB.rotation[1] = 0; bhB.rotation[2] = -0.14; bhB.scale = 1;
          } else {
            // Upward bright cyan chevron cap above `+` / `×` gates.
            const gc = goodCapScratch[slot]!;
            const lift = view.reducedMotion ? 0 : 0.07 * Math.sin(time * 5.2 + slot);
            gc.position[0] = gate.x; gc.position[1] = 2.98 + lift; gc.position[2] = worldGateZ + 0.08;
            gc.rotation[0] = 0; gc.rotation[1] = 0; gc.rotation[2] = 0; gc.scale = 1;
          }
          const text = opLabel(gate.kind, gate.n);
          if (gateText[slot] !== text) {
            gateText[slot] = text;
            paintOpLabel(opCanvases[slot]!.g, text);
            opTextures[slot]!.needsUpdate = true;
          }
          node(`op-label-${slot}`).setVisible(true).setPosition(gate.x, 0, worldGateZ);
        }
        node("gate-good-caps").setInstances(goodCapScratch);
        node("gate-bad-hazards").setInstances(badHazardScratch);

        /* segmented crystal-masonry boss walls + spinning flank buzzsaws + live breakRatio fissure shader */
        const liveWalls = o.walls.filter((w) => w.active);
        wallSlots.retain(liveWalls, (slot) => {
          walls.collapse(slot);
          wallRunZ[slot] = Number.NaN;
          wallText[slot] = "";
          node(`wall-label-${slot}`).setVisible(false);
        });
        for (let s = 0; s < CONFIG.WALLS * 2; s += 1) {
          const hs = hazardSawScratch[s]!;
          hs.position[0] = 0;
          hs.position[1] = -40;
          hs.position[2] = -60;
          hs.scale = 0.001;
        }
        for (let g = 0; g < CONFIG.WALLS * 3; g += 1) {
          const bg = bossGuardScratch[g]!;
          bg.position[0] = 0;
          bg.position[1] = -40;
          bg.position[2] = -60;
          bg.scale = 0.001;
        }
        let nearestAheadHp = 0;
        let nearestAheadZ = Number.POSITIVE_INFINITY;
        const sawSpin = view.reducedMotion ? 0 : time * 9.5;
        for (const wall of liveWalls) {
          if (wall.z > -1.5 && wall.z < nearestAheadZ) {
            nearestAheadZ = wall.z;
            nearestAheadHp = wall.hp;
          }
          const { slot, fresh } = wallSlots.use(wall);
          if (slot < 0) continue;
          const runZ = wallWorldZ(wall.z, o.distance, o.shieldActive);
          if (fresh || wallRunZ[slot] !== runZ) {
            wallRunZ[slot] = runZ;
            walls.place(slot, 0, 0, scrollFrameZ(runZ, roadAnchor), 0, 1, 1, 1);
            walls.setTone(slot, LINEAR.wall);
          }
          const canSmash = o.number > wall.hp || o.shieldActive;
          const labelKey = `${wall.hp}:${canSmash ? 1 : 0}`;
          if (wallText[slot] !== labelKey) {
            wallText[slot] = labelKey;
            paintWallHp(wallCanvases[slot]!.g, wall.hp, canSmash);
            wallTextures[slot]!.needsUpdate = true;
          }
          const worldWallZ = wallWorldZ(wall.z, back, o.shieldActive);
          node(`wall-label-${slot}`).setVisible(true).setPosition(0, 0, worldWallZ);
          for (let sideIdx = 0; sideIdx < 2; sideIdx += 1) {
            const side = sideIdx === 0 ? -1 : 1;
            const hs = hazardSawScratch[slot * 2 + sideIdx]!;
            hs.position[0] = side * WALL_SAW.x;
            hs.position[1] = WALL_SAW.y;
            hs.position[2] = worldWallZ + WALL_SAW.z;
            hs.rotation[0] = 0;
            hs.rotation[1] = 0;
            hs.rotation[2] = side * sawSpin;
            hs.scale = 1;
          }
          // Station 2 flanking Heavy Riot Guards + 1 central Giant Riot Captain (`minY = 0`) defending the boss wall
          for (let gIdx = 0; gIdx < BOSS_GUARDS.length; gIdx += 1) {
            const guard = BOSS_GUARDS[gIdx]!;
            const bg = bossGuardScratch[slot * 3 + gIdx]!;
            const sway = view.reducedMotion ? 0 : GUARD_SWAY * Math.sin(time * 3.8 + slot * 1.3 + gIdx * 1.7);
            bg.position[0] = guard.x;
            bg.position[1] = 0;
            bg.position[2] = worldWallZ + guard.z;
            bg.rotation[0] = 0;
            bg.rotation[1] = guard.yaw + sway;
            bg.rotation[2] = 0;
            bg.scale = guard.scale;
          }
        }
        node("hazard-saws").setInstances(hazardSawScratch);
        applyIdolSlots(node, "boss-guards", bossGuardScratch);
        const breakRatio = nearestAheadHp > 0 ? Math.min(1.5, Math.max(0, o.number / nearestAheadHp)) : 0;
        node("walls").setUniform?.("nsBreakRatio", breakRatio);

        /* powerups: bob and spin in place */
        const livePowerups = o.powerups.filter((p) => p.active);
        powerupSlots.retain(livePowerups, (slot) => {
          powerups.collapse(slot);
          powerupRunZ[slot] = Number.NaN;
          powerupKind[slot] = "";
        });
        for (const p of livePowerups) {
          const { slot, fresh } = powerupSlots.use(p);
          if (slot < 0) continue;
          const runZ = -(p.z + o.distance);
          if (fresh || powerupRunZ[slot] !== runZ) {
            powerupRunZ[slot] = runZ;
          }
          if (powerupKind[slot] !== p.kind) {
            powerupKind[slot] = p.kind;
            powerups.setTone(slot, POWERUP_TONES[p.kind]);
          }
          const bob = 0.85 + 0.12 * Math.sin(time * 4 + runZ);
          powerups.place(slot, p.x, bob, scrollFrameZ(runZ, roadAnchor), time * 1.5, 1, 1, 1);
        }

        /* hero clearcoat core, curved sphere-cap inlay, shadow, hex-Fresnel shield */
        const tau = Math.PI * 2;
        const dtStep = time > prevTime ? Math.min(0.1, time - prevTime) : 0;
        if (dtStep > 1e-4 && !view.reducedMotion) {
          const vx = Math.max(-14, Math.min(14, (laneX - prevLaneX) / dtStep));
          laneBank += (vx * 0.018 - laneBank) * Math.min(1, dtStep * 14);
          laneBank = Math.max(-0.16, Math.min(0.16, laneBank));
        } else if (view.reducedMotion) {
          laneBank = 0;
        }
        prevLaneX = laneX;
        prevTime = time;

        const ballY = DIMS.BALL_RADIUS;
        const roll = (-travelled / DIMS.BALL_RADIUS) % tau;
        node("ball").setPosition(laneX, ballY, 0).setRotation(roll, 0, -laneBank * 0.55);
        if (o.number !== lastNumber) {
          lastNumber = o.number;
          paintNumber(numberCanvas.g, o.number);
          numberTexture.needsUpdate = true;
        }
        node("ball-label").setPosition(laneX, ballY, 0).setRotation(-0.18, 0, -laneBank * 0.35);
        node("ball-shadow").setPosition(laneX, 0.03, 0);
        if (o.shieldActive !== lastShield) {
          lastShield = o.shieldActive;
          node("shield").setVisible(o.shieldActive);
        }
        if (o.shieldActive) node("shield").setPosition(laneX, ballY, 0).setRotation(0, (time * 0.65) % tau, 0);


        /* gate-shatter / wall-smash sparks flipbook burst */
        const totalBursts = o.events.pickGood + o.events.smash + o.events.wallBlock;
        if (lastBurstEvents < 0) {
          lastBurstEvents = totalBursts;
          lastSmashEvents = o.events.smash;
        } else if (totalBursts > lastBurstEvents) {
          const isSmash = o.events.smash > lastSmashEvents;
          lastBurstEvents = totalBursts;
          lastSmashEvents = o.events.smash;
          burstStartTime = time;
          burstX = laneX;
          burstTint = isSmash ? [1.65, 1.28, 0.42] : [0.55, 1.45, 1.65];
        }
        const burstAge = time - burstStartTime;
        const sparksHandle = node("sparks-burst");
        const smashSparksFb = node("smash-flipbook-sparks");
        const smashPlasmaFb = node("smash-flipbook-plasma");
        const smashActive = burstAge >= 0 && burstAge < 0.48 && !view.reducedMotion && burstTint[0] > 1.2;
        if (burstAge >= 0 && burstAge < 0.42 && !view.reducedMotion) {
          const frame = Math.min(sparksAtlas.frameCount - 1, Math.floor((burstAge / 0.42) * sparksAtlas.frameCount));
          const scale = 0.85 + burstAge * 1.35;
          sparksHandle
            .setVisible(true)
            .setPosition(burstX, 1.35, -0.35)
            .setScale(scale);
          sparksHandle.setUniform?.("nsFrame", frame);
          sparksHandle.setUniform?.("nsTint", burstTint);
          sparksHandle.setUniform?.("alpha", Math.max(0, 1 - burstAge / 0.42));
        } else {
          sparksHandle.setVisible(false);
        }
        if (smashActive) {
          const smScale = 1.0 + burstAge * 1.85;
          smashSparksFb.setVisible(true).setPosition(burstX, 1.65, -0.5).setScale(smScale);
          smashPlasmaFb.setVisible(true).setPosition(burstX, 1.55, -0.6).setScale(smScale * 1.15);
        } else {
          smashSparksFb.setVisible(false);
          smashPlasmaFb.setVisible(false);
        }

        /* particles + shards: per-frame movers in the player frame */
        for (let i = 0; i < CONFIG.PARTICLES; i++) {
          const p = o.particles[i]!;
          if (!p.active) {
            particles.collapse(i);
            continue;
          }
          const s = Math.max(0.05, p.life / p.maxLife);
          particles.place(i, p.x, p.y, -p.z, 0, s, s, s);
          particles.setTone(i, toneOf(p.color));
        }
        for (let i = 0; i < CONFIG.SHARDS; i++) {
          const s = o.shards[i]!;
          if (!s.active) {
            shards.collapse(i);
            continue;
          }
          const k = Math.max(0.05, s.life / s.maxLife);
          shards.place(i, s.x, s.y, -s.z, s.spin * (s.maxLife - s.life), k, k, k);
        }

        /* scrolling-frame node offsets + dirty-range uploads */
        for (const id of SCROLL_BATCH_IDS) {
          node(id).setPosition(0, 0, frameZ);
        }
        deck.flush(node("deck"));
        edges.flush(node("edges"), false);
        dashes.flush(node("dashes"), false);
        panels.flush(node("gate-panels"));
        frames.flush(node("gate-frames"));
        walls.flush(node("walls"));
        powerups.flush(node("powerups"));
        particles.flush(node("particles"), false);
        shards.flush(node("shards"));

        /* camera + ImpactRig shake/roll/FOV blend */
        const cam = view.shown?.cam ?? {
          x: 0.45 * laneX,
          y: LOOK.camera.height,
          z: LOOK.camera.back,
          lookX: laneX * 0.6,
          lookY: 1,
          lookZ: LOOK.camera.lookAheadZ
        };
        const baseFov = aspect >= 1 ? LOOK.camera.fovDeg : LOOK.camera.fovDeg + 25 * Math.min(1, (1 - aspect) / 0.5);
        const punch = view.reducedMotion ? 0 : (view.fovPunch ?? 0);
        const sx = view.reducedMotion ? 0 : (view.shakeOffset?.[0] ?? 0);
        const sy = view.reducedMotion ? 0 : (view.shakeOffset?.[1] ?? 0);
        const sz = view.reducedMotion ? 0 : (view.shakeOffset?.[2] ?? 0);
        const rollRad = view.reducedMotion ? 0 : (view.shakeRoll ?? 0);
        const upX = Math.sin(rollRad);
        const upY = Math.cos(rollRad);
        controller.setPose(
          {
            position: [cam.x + sx, cam.y + sy, cam.z + sz],
            target: [cam.lookX + sx * 0.35, cam.lookY + sy * 0.35, cam.lookZ],
            up: [upX, upY, 0],
            fov: baseFov + punch
          },
          { cut: false }
        );
      }

      function warm(on: boolean): void {
        node("shield").setVisible(on);
        if (on) node("shield").setPosition(0, -50, -60);
        node("sparks-burst").setVisible(on);
        if (on) node("sparks-burst").setPosition(0, -50, -60);
        node("smash-flipbook-sparks").setVisible(on);
        if (on) node("smash-flipbook-sparks").setPosition(0, -50, -60);
        node("smash-flipbook-plasma").setVisible(on);
        if (on) node("smash-flipbook-plasma").setPosition(0, -50, -60);
        for (let i = 0; i < CONFIG.GATES; i++) {
          const h = node(`op-label-${i}`).setVisible(on);
          if (on) h.setPosition(0, -50, -60);
        }
        for (let i = 0; i < CONFIG.WALLS; i++) {
          const h = node(`wall-label-${i}`).setVisible(on);
          if (on) h.setPosition(0, -50, -60);
        }
      }

      const batches = [deck, edges, dashes, panels, frames, walls, powerups, particles, shards];
      return {
        update,
        warm,
        get nodeCount() {
          return handles.size;
        },
        get uploadedVertices() {
          return batches.reduce((sum, b) => sum + b.uploadedVertices, 0);
        }
      };
    }
  };
}
