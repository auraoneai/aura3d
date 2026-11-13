/**
 * Number Surge world on the public `@aura3d/engine` surface: HDR AgX skyway lighting
 * (`lights.key` + `lights.hemisphere` + `environments.studio` softbox IBL, zero ambient),
 * deep midnight-violet `#0d0820` linear fog (`near >= 65, far >= 250`) + `neonBloom`,
 * paired GLSL 3.00 + WGSL holographic `frostedGateSpec` portals, `crystalWallSpec`
 * segmented boss walls, clearcoat hero core with curved `sphereCapMesh` inlay, glossy
 * `lacquer` + `ceramic` value-evolution crowd tokens, and `sparks` flipbook bursts.
 */
import {
  camera,
  effects,
  environments,
  geometry,
  instances,
  lights,
  material,
  scene,
  texture,
  type AuraApp,
  type AuraTransformSpec
} from "@aura3d/engine";
import { labCameraOptions, readLabFlags } from "../../../examples/shared/lab-flags";
import {
  Batch,
  CORRIDOR_BOUNDS,
  Slots,
  scrollFrameZ,
  flatSpec,
  shadowSpec,
  skySpec,
  gradientSkyFragment,
  toonSpec,
  hexToLinear,
  type CustomSpec,
  type MeshData,
  type Rgb
} from "../../../examples/shared/runner-kit/index";
import { createFlipbookAtlas } from "../../showcase-port-shared/vfx-pack";
import {
  SURGE_MATERIALS,
  bossWallSawRollerHazardMeshData,
  buildCeramicEscortOrbSpec,
  buildHazardBuzzsawSpec,
  buildHeroSurgeBallNode,
  buildLacquerEscortOrbSpec,
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

const LACQUER_TOKEN_MAX = 8;
const CERAMIC_TOKEN_MAX = 6;

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

function crowdCounts(value: number): { readonly lacquer: number; readonly ceramic: number } {
  if (value >= 1000) return { lacquer: 8, ceramic: 6 };
  if (value >= 100) return { lacquer: 5, ceramic: 3 };
  if (value >= 10) return { lacquer: 3, ceramic: 1 };
  return { lacquer: 1, ceramic: 0 };
}

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

  // Synthwave arcade skyway dome (deep midnight-violet sky, striped dusk sun, twinkling starfield) sized inside the far plane.
  add("sky", sphereMesh(360, 48, 24), synthSkySpec());

  // Studio skyway lighting rig: 1 shadowed 1-cascade key + 1 cool skyway hemisphere fill + studio softbox IBL (zero ambient).
  builder
    .add(
      lights.key({
        name: "skyway-key",
        position: [...KEY_POS],
        target: [...KEY_TARGET],
        color: "#ffe6c8",
        intensity: 2.8,
        shadow: { cascades: 1, maxDistance: 68, mapSize: 1024 }
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

  // Refractive holographic gate panels + lattice-truss alloy math-gate gantries.
  const panels = new Batch(gatePanelMesh(), CONFIG.GATES, LINEAR.gateGood, CORRIDOR_BOUNDS);
  const frames = new Batch(highwayGateGantryFrameMeshData(), CONFIG.GATES, LINEAR.gateFrame, CORRIDOR_BOUNDS);
  addBatch("gate-panels", panels, frostedGateSpec());
  addBatch("gate-frames", frames, stanchionSpec(KEY_SUN_DIR), true);

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
  add("shield", sphereMesh(0.96, 24, 16), hexShieldSpec(LINEAR.shield));

  // Star-bevelled lacquer & crown-cut ceramic value-evolution crowd tokens (1 GPU-instanced draw per material family, positive scales only).
  builder
    .add(
      instances
        .custom(buildLacquerEscortOrbSpec(), {
          name: "crowd-lacquer",
          castShadow: true,
          receiveShadow: true,
          material: SURGE_MATERIALS.escortLacquer,
          transforms: parkedTransforms(LACQUER_TOKEN_MAX)
        })
        .runtime({ id: "crowd-lacquer" })
    )
    .add(
      instances
        .custom(buildCeramicEscortOrbSpec(), {
          name: "crowd-ceramic",
          castShadow: true,
          receiveShadow: true,
          material: SURGE_MATERIALS.escortCeramic,
          transforms: parkedTransforms(CERAMIC_TOKEN_MAX)
        })
        .runtime({ id: "crowd-ceramic" })
    );

  // Segmented crystal-masonry + crusher-roller boss walls & spinning flank rotary buzzsaws.
  const walls = new Batch(bossWallSawRollerHazardMeshData(), CONFIG.WALLS, LINEAR.wall, CORRIDOR_BOUNDS);
  addBatch("walls", walls, crystalWallSpec(KEY_SUN_DIR), true);
  builder.add(
    instances
      .custom(buildHazardBuzzsawSpec(), {
        name: "hazard-saws",
        castShadow: false,
        receiveShadow: false,
        material: SURGE_MATERIALS.sawBladeSteel,
        transforms: parkedTransforms(CONFIG.WALLS * 2)
      })
      .runtime({ id: "hazard-saws" })
  );
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

  // Procedural `createFlipbookAtlas("sparks")` gate-shatter / wall-smash burst + cyan speed ribbon.
  const sparksAtlas = createFlipbookAtlas("sparks", [255, 220, 118]);
  add("sparks-burst", quadMesh(2.9, 2.9), sparksFlipbookSpec(sparksAtlas.texture, sparksAtlas.columns, sparksAtlas.rows));
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
      const lacquerScratch = parkedTransforms(LACQUER_TOKEN_MAX);
      const ceramicScratch = parkedTransforms(CERAMIC_TOKEN_MAX);
      const hazardSawScratch = parkedTransforms(CONFIG.WALLS * 2);

      let roadAnchor = 0;
      let lastNumber = -1;
      let lastShield = false;
      let lastBurstEvents = -1;
      let lastSmashEvents = -1;
      let burstStartTime = -10;
      let burstX = 0;
      let burstTint: Rgb = [1.4, 1.15, 0.55];

      // Touch every node once so nodeCount and warm() cover the full set.
      for (const id of BATCH_IDS) node(id);
      node("sky");
      node("ball");
      node("ball-label");
      node("ball-shadow");
      node("crowd-lacquer");
      node("crowd-ceramic");
      node("hazard-saws");
      node("sparks-burst").setVisible(false);
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

        /* holographic gates + beveled chrome stanchions */
        const liveGates = o.gates.filter((g) => g.active && !o.rows[g.row]?.resolved);
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
          if (fresh || gateRunZ[slot] !== runZ) {
            gateRunZ[slot] = runZ;
            const z = scrollFrameZ(runZ, roadAnchor);
            panels.place(slot, gate.x, 0, z, 0, 1, 1, 1);
            frames.place(slot, gate.x, 0, z, 0, 1, 1, 1);
            const negative = gate.kind === "sub" || gate.kind === "div2";
            const bright = negative ? LINEAR.gateBad : LINEAR.gateGood;
            panels.setTone(slot, bright);
            frames.setTone(slot, bright);
          }
          const text = opLabel(gate.kind, gate.n);
          if (gateText[slot] !== text) {
            gateText[slot] = text;
            paintOpLabel(opCanvases[slot]!.g, text);
            opTextures[slot]!.needsUpdate = true;
          }
          node(`op-label-${slot}`).setVisible(true).setPosition(gate.x, 0, -(gate.z + back));
        }

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
          const runZ = -(wall.z + o.distance);
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
          const worldWallZ = -(wall.z + back);
          node(`wall-label-${slot}`).setVisible(true).setPosition(0, 0, worldWallZ);
          for (let sideIdx = 0; sideIdx < 2; sideIdx += 1) {
            const side = sideIdx === 0 ? -1 : 1;
            const hs = hazardSawScratch[slot * 2 + sideIdx]!;
            hs.position[0] = side * 2.86;
            hs.position[1] = 1.82;
            hs.position[2] = worldWallZ + 0.34;
            hs.rotation[0] = 0;
            hs.rotation[1] = 0;
            hs.rotation[2] = side * sawSpin;
            hs.scale = 1;
          }
        }
        node("hazard-saws").setInstances(hazardSawScratch);
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
        const ballY = DIMS.BALL_RADIUS;
        const roll = -travelled / DIMS.BALL_RADIUS;
        node("ball").setPosition(laneX, ballY, 0).setRotation(roll, 0, 0);
        if (o.number !== lastNumber) {
          lastNumber = o.number;
          paintNumber(numberCanvas.g, o.number);
          numberTexture.needsUpdate = true;
        }
        node("ball-label").setPosition(laneX, ballY, 0).setRotation(-0.18, 0, 0);
        node("ball-shadow").setPosition(laneX, 0.03, 0);
        if (o.shieldActive !== lastShield) {
          lastShield = o.shieldActive;
          node("shield").setVisible(o.shieldActive);
        }
        if (o.shieldActive) node("shield").setPosition(laneX, ballY, 0).setRotation(0, time * 0.65, 0);

        /* sculpted cyber-sprint squad runners in V-wedge formation scaled by floor(log10(number)) — zero per-frame allocs */
        const counts = crowdCounts(o.number);
        const cadence = view.reducedMotion ? 0 : time * 11.5;
        for (let i = 0; i < LACQUER_TOKEN_MAX; i++) {
          const t = lacquerScratch[i]!;
          if (i < counts.lacquer) {
            const side = i % 2 === 0 ? -1 : 1;
            const rank = Math.floor(i / 2);
            const flankX = side * (0.86 + rank * 0.34);
            const tx = Math.max(-DIMS.EDGE_X + 0.34, Math.min(DIMS.EDGE_X - 0.34, laneX + flankX));
            const stridePhase = cadence + i * 1.15;
            const ty = 0.02 + (view.reducedMotion ? 0 : 0.065 * Math.abs(Math.sin(stridePhase)));
            const tz = 0.42 + rank * 0.48 + (view.reducedMotion ? 0 : 0.04 * Math.cos(stridePhase));
            t.position[0] = tx;
            t.position[1] = ty;
            t.position[2] = tz;
            t.rotation[0] = -0.14;
            t.rotation[1] = view.reducedMotion ? 0 : 0.08 * Math.sin(stridePhase);
            t.rotation[2] = view.reducedMotion ? 0 : -side * 0.05;
            t.scale = 0.92;
          } else {
            t.position[0] = 0;
            t.position[1] = -40;
            t.position[2] = -60;
            t.scale = 0.001;
          }
        }
        for (let i = 0; i < CERAMIC_TOKEN_MAX; i++) {
          const t = ceramicScratch[i]!;
          if (i < counts.ceramic) {
            const side = i % 2 === 0 ? 1 : -1;
            const rank = Math.floor(i / 2);
            const flankX = side * (0.64 + rank * 0.42);
            const tx = Math.max(-DIMS.EDGE_X + 0.34, Math.min(DIMS.EDGE_X - 0.34, laneX + flankX));
            const stridePhase = cadence * 1.06 + i * 1.45 + 0.6;
            const ty = 0.02 + (view.reducedMotion ? 0 : 0.072 * Math.abs(Math.sin(stridePhase)));
            const tz = 0.95 + rank * 0.52;
            t.position[0] = tx;
            t.position[1] = ty;
            t.position[2] = tz;
            t.rotation[0] = -0.16;
            t.rotation[1] = view.reducedMotion ? 0 : 0.09 * Math.cos(stridePhase);
            t.rotation[2] = view.reducedMotion ? 0 : -side * 0.06;
            t.scale = 1.02;
          } else {
            t.position[0] = 0;
            t.position[1] = -40;
            t.position[2] = -60;
            t.scale = 0.001;
          }
        }
        node("crowd-lacquer").setInstances(lacquerScratch);
        node("crowd-ceramic").setInstances(ceramicScratch);

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
