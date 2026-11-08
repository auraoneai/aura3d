/**
 * Number Surge world on the public `@aura3d/engine` surface: kit toon/flat/shadow
 * `material.custom` programs, `geometry.dynamic` batches (one node per pooled
 * entity kind), a scrolling frame for road/gates/walls/powerups (vertices written
 * once per appearance, node moved by the scroll), canvas-text op labels and a
 * ball-number decal repainted only when the value changes.
 */
import { camera, effects, environments, geometry, lights, material, scene, texture, type AuraApp } from "@aura3d/engine";
import { labCameraOptions, readLabFlags } from "../../../examples/shared/lab-flags";
import {
  Batch, Slots, mergeMeshes, scrollFrameZ, flatSpec, shadowSpec, skySpec, gradientSkyFragment, toonSpec,
  hexToLinear, type CustomSpec, type MeshData, type Rgb
} from "../../../examples/shared/runner-kit/index";
import { CONFIG, opLabel, type BossWall, type Gate, type NumberSurgeSim, type Powerup } from "./sim";
import { DIMS, ballMesh, ballLabelMesh, gateFrameMesh, gatePanelMesh, groundQuad, opLabelMesh, particleMesh, powerupMesh, roadDashMesh, roadEdgeMesh, roadSegmentMesh, shardMesh, shadowMesh, sphereMesh, wallLabelMesh, wallMesh } from "./meshes";
import { LINEAR, LOOK, PALETTE, SKY_STOPS } from "./look";
import type { Shown } from "./presentation";
import { addScenery, deckSpec, edgeGlowSpec, sceneryProgramSpecs, stripSpec, synthSkySpec } from "./scenery";

type Scene = ReturnType<typeof scene>;
type TextureHandle = ReturnType<typeof texture.canvas>;
type NodeHandle = ReturnType<AuraApp["nodes"]["require"]>;

const f32 = (a: readonly number[]): Float32Array => Float32Array.from(a);

function dynamicFrom(m: MeshData) {
  return geometry.dynamic({ positions: f32(m.positions), normals: f32(m.normals), uvs: f32(m.uvs), indices: Uint32Array.from(m.indices) });
}

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
    textAlign: "center" as CanvasTextAlign,
    textBaseline: "middle" as CanvasTextBaseline,
    font: "",
    clearRect: () => undefined,
    fillText: () => undefined
  } as unknown as CanvasRenderingContext2D;
  const canvas = { width: w, height: h, getContext: () => g } as unknown as HTMLCanvasElement;
  (g as unknown as { canvas: HTMLCanvasElement }).canvas = canvas;
  return { canvas, g };
}

/** Op label: big white text on transparent ground (the panel tone carries the colour). */
export function paintOpLabel(g: CanvasRenderingContext2D, text: string): void {
  const { width: w, height: h } = g.canvas;
  g.clearRect(0, 0, w, h);
  g.fillStyle = "#ffffff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  const size = text.length > 3 ? 84 : 104;
  g.font = `700 ${size}px "GT Walsheim", sans-serif`;
  g.fillText(text, w / 2, h / 2 + 6);
}

/** Ball number decal: dark ink on transparent ground, sized to fit six digits. */
export function paintNumber(g: CanvasRenderingContext2D, value: number): void {
  const { width: w, height: h } = g.canvas;
  g.clearRect(0, 0, w, h);
  const text = String(value);
  g.fillStyle = PALETTE.ballInk;
  g.textAlign = "center";
  g.textBaseline = "middle";
  const size = text.length <= 2 ? 128 : text.length <= 4 ? 96 : 68;
  g.font = `700 ${size}px "GT Walsheim", sans-serif`;
  g.fillText(text, w / 2, h / 2 + 6);
}

/** Boss wall HP: gold number over a small WALL caption. */
export function paintWallHp(g: CanvasRenderingContext2D, hp: number): void {
  const { width: w, height: h } = g.canvas;
  g.clearRect(0, 0, w, h);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "#ffd84d";
  g.font = `700 110px "GT Walsheim", sans-serif`;
  g.fillText(String(hp), w / 2, h / 2 - 12);
  g.fillStyle = "#eaf6ff";
  g.font = `700 40px "GT Walsheim", sans-serif`;
  g.fillText("WALL", w / 2, h / 2 + 56);
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
  /** Milestone FOV punch in degrees (presentation only; 0 on reduced motion). */
  readonly fovPunch?: number;
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

export function buildWorld(options: WorldOptions): World {
  const look = options.look ?? LOOK;
  const builder: Scene = scene()
    .background(look.background)
    .camera(camera.perspective({ ...labCameraOptions(readLabFlags(), "reversed"), position: [0, LOOK.camera.height, LOOK.camera.back], target: [0, 1, LOOK.camera.lookAheadZ], fov: LOOK.camera.fovDeg, near: 0.1, far: 320 }));

  const add = (id: string, mesh: MeshData, spec: CustomSpec): void => {
    builder.add(geometry.custom(dynamicFrom(mesh), { name: id, material: material.custom(spec) }).runtime({ id }));
  };
  const addBatch = (id: string, batch: Batch, spec: CustomSpec): void => {
    builder.add(geometry.custom(batch.geometry(), { name: id, material: material.custom(spec) }).runtime({ id }));
  };

  // Synthwave dome (striped sun, stars) sized inside the far plane so the scenery in front of it is never overdrawn.
  add("sky", sphereMesh(300, 48, 24), synthSkySpec());

  // Art-direction rig: one shadowed dusk key + preset IBL fill (the kit toon programs
  // shade themselves; the rig lights any future GLB and satisfies the scene audit).
  const sun = look.sunDir;
  builder.add(lights.directional({ name: "dusk-key", position: [sun[0] * 80, sun[1] * 80, sun[2] * 80], target: [0, 0, 0], intensity: 1.4, color: "#ffd9b0", shadow: { cascades: 1, maxDistance: 160 } }));
  builder.add(environments.preset("sunset", { name: "dusk-fill", intensity: 0.5, background: false }));

  const deck = new Batch(roadSegmentMesh(), CONFIG.SEGMENTS);
  const edges = new Batch(roadEdgeMesh(), CONFIG.SEGMENTS);
  const dashes = new Batch(roadDashMesh(), CONFIG.SEGMENTS);
  addBatch("deck", deck, deckSpec(LINEAR.road, LINEAR.roadStripe));
  addBatch("edges", edges, stripSpec(LINEAR.roadEdge, 1.8, 0.95));
  addBatch("dashes", dashes, stripSpec(LINEAR.roadStripe, 1.5, 0.8));
  // Painted neon glow either side of the edge trims (the bloom pass is not available on this output path).
  const edgeGlow = new Batch(mergeMeshes([groundQuad(1.6, DIMS.SEGMENT_LENGTH, -DIMS.EDGE_X), groundQuad(1.6, DIMS.SEGMENT_LENGTH, DIMS.EDGE_X)]), CONFIG.SEGMENTS);
  addBatch("edge-glow", edgeGlow, edgeGlowSpec(LINEAR.roadEdge, 0.55));

  const panels = new Batch(gatePanelMesh(), CONFIG.GATES, LINEAR.gateGood);
  const frames = new Batch(gateFrameMesh(), CONFIG.GATES, LINEAR.gateGood);
  addBatch("gate-panels", panels, toonSpec([1, 1, 1], undefined, [0, 0, 0], true));
  addBatch("gate-frames", frames, toonSpec([1, 1, 1], undefined, [0.08, 0.08, 0.1], true));

  const opCanvases = Array.from({ length: CONFIG.GATES }, () => makeCanvas(256, 160));
  const opTextures = opCanvases.map(({ canvas }) => texture.canvas({ canvas, colorSpace: "linear" }));
  for (let i = 0; i < CONFIG.GATES; i++) {
    paintOpLabel(opCanvases[i]!.g, "+5");
    add(`op-label-${i}`, opLabelMesh(), labelSpec(opTextures[i]!));
  }

  add("ball", ballMesh(), toonSpec(LINEAR.ball));
  const numberCanvas = makeCanvas(256, 256);
  paintNumber(numberCanvas.g, CONFIG.START_NUMBER);
  const numberTexture = texture.canvas({ canvas: numberCanvas.canvas, colorSpace: "linear" });
  add("ball-label", ballLabelMesh(), labelSpec(numberTexture));
  add("ball-shadow", shadowMesh(), shadowSpec());
  add("shield", sphereMesh(0.95, 20, 14), flatSpec(LINEAR.shield, 0.24));

  const walls = new Batch(wallMesh(), CONFIG.WALLS, LINEAR.wall);
  addBatch("walls", walls, toonSpec([1, 1, 1], undefined, [0.04, 0.01, 0.07], true));
  const wallCanvases = Array.from({ length: CONFIG.WALLS }, () => makeCanvas(384, 208));
  const wallTextures = wallCanvases.map(({ canvas }) => texture.canvas({ canvas, colorSpace: "linear" }));
  for (let i = 0; i < CONFIG.WALLS; i++) {
    paintWallHp(wallCanvases[i]!.g, 50);
    add(`wall-label-${i}`, wallLabelMesh(), labelSpec(wallTextures[i]!));
  }

  const powerups = new Batch(powerupMesh(), CONFIG.POWERUPS, LINEAR.powerup);
  addBatch("powerups", powerups, toonSpec([1, 1, 1], undefined, [0.1, 0.08, 0.0], true));

  const particles = new Batch(particleMesh(), CONFIG.PARTICLES, [1, 1, 1]);
  addBatch("particles", particles, flatSpec([1, 1, 1], 1, true));
  const shards = new Batch(shardMesh(), CONFIG.SHARDS, LINEAR.shard);
  addBatch("shards", shards, toonSpec([1, 1, 1], undefined, [0.05, 0.02, 0.1], true));

  // Ground plane under the grid floor so the horizon never shows the clear colour.
  add("underlay", groundQuad(240, 480, 0, -15, -120), toonSpec(hexToLinear("#141133")));

  const scenery = addScenery(builder);

  // Post: a cool grade and a violet vignette (the bloom pass is skipped on this fused-LDR output path, so glows are
  // painted in the sky, edge-glow and halo shaders instead). Tone mapping stays "none" (main.ts).
  builder
    .add(effects.colorGrade({ name: "grade", contrast: 1.08, saturation: 1.12, temperature: -0.02, gain: 1.05 }))
    .add(effects.vignette({ name: "vignette", intensity: 0.24, color: "#140a2e" }));

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
      const gateSlots = new Slots<Gate>(CONFIG.GATES);
      const wallSlots = new Slots<BossWall>(CONFIG.WALLS);
      const powerupSlots = new Slots<Powerup>(CONFIG.POWERUPS);
      const gateRunZ = new Float64Array(CONFIG.GATES).fill(Number.NaN);
      const gateText = new Array<string>(CONFIG.GATES).fill("");
      const wallRunZ = new Float64Array(CONFIG.WALLS).fill(Number.NaN);
      const wallText = new Array<number>(CONFIG.WALLS).fill(-1);
      const powerupRunZ = new Float64Array(CONFIG.POWERUPS).fill(Number.NaN);
      const powerupKind = new Array<string>(CONFIG.POWERUPS).fill("");
      const segmentJ = new Array<number>(CONFIG.SEGMENTS).fill(Number.NaN);
      let lastNumber = -1;
      let lastShield = false;

      // Touch every node once so nodeCount and warm() cover the full set.
      for (const id of BATCH_IDS) node(id);
      node("sky");
      node("ball");
      node("ball-label");
      node("ball-shadow");
      node("underlay");
      node("shield").setVisible(false);
      for (let i = 0; i < CONFIG.GATES; i++) node(`op-label-${i}`).setVisible(false);
      for (let i = 0; i < CONFIG.WALLS; i++) node(`wall-label-${i}`).setVisible(false);

      function update(sim: NumberSurgeSim, aspect: number, view: WorldView = {}): void {
        const o = sim.o;
        const distance = view.shown?.distance ?? o.distance;
        const back = view.shown?.back ?? 0;
        const laneX = view.shown?.laneOffset ?? o.laneOffset;
        // The camera looks down −z, so travelling forward means run space decreases: scroll = −(shown distance), and
        // something `d` ahead of the ball sits at world z = −d. Road-frame nodes therefore move toward the camera.
        const travelled = distance - back;
        const scroll = -travelled;
        const frameZ = -scroll;
        const time = view.shown?.time ?? o.time;

        sceneryRuntime.update(travelled, time);

        /* road ring: segment j sits at run-space z = j * SEGMENT_LENGTH (world z = runZ - scroll, so ahead of the ball is
         * runZ < scroll), slot = j mod SEGMENTS; the ring keeps 10 segments behind the camera and the rest ahead. */
        const jStart = Math.floor(scroll / DIMS.SEGMENT_LENGTH) - (CONFIG.SEGMENTS - 10);
        for (let j = jStart; j < jStart + CONFIG.SEGMENTS; j++) {
          const slot = ((j % CONFIG.SEGMENTS) + CONFIG.SEGMENTS) % CONFIG.SEGMENTS;
          if (segmentJ[slot] === j) continue;
          segmentJ[slot] = j;
          const z = j * DIMS.SEGMENT_LENGTH;
          deck.place(slot, 0, 0, z, 0, 1, 1, 1);
          edges.place(slot, 0, 0.02, z, 0, 1, 1, 1);
          edgeGlow.place(slot, 0, 0.03, z, 0, 1, 1, 1);
          dashes.place(slot, 0, 0.02, z, 0, 1, 1, 1);
        }

        /* gates (scrolling frame; tone by op sign; canvas label repainted on op change) */
        // A row's gates leave the world once it resolves at the ball, so passed panels never sweep across the camera.
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
            const z = scrollFrameZ(runZ, 0);
            panels.place(slot, gate.x, 0, z, 0, 1, 1, 1);
            frames.place(slot, gate.x, 0, z, 0, 1, 1, 1);
            const negative = gate.kind === "sub" || gate.kind === "div2";
            const bright = negative ? LINEAR.gateBad : LINEAR.gateGood;
            panels.setTone(slot, [bright[0] * 0.22, bright[1] * 0.22, bright[2] * 0.22]);
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

        /* boss walls */
        const liveWalls = o.walls.filter((w) => w.active);
        wallSlots.retain(liveWalls, (slot) => {
          walls.collapse(slot);
          wallRunZ[slot] = Number.NaN;
          wallText[slot] = -1;
          node(`wall-label-${slot}`).setVisible(false);
        });
        for (const wall of liveWalls) {
          const { slot, fresh } = wallSlots.use(wall);
          if (slot < 0) continue;
          const runZ = -(wall.z + o.distance);
          if (fresh || wallRunZ[slot] !== runZ) {
            wallRunZ[slot] = runZ;
            walls.place(slot, 0, 0, scrollFrameZ(runZ, 0), 0, 1, 1, 1);
            walls.setTone(slot, LINEAR.wall);
          }
          if (wallText[slot] !== wall.hp) {
            wallText[slot] = wall.hp;
            paintWallHp(wallCanvases[slot]!.g, wall.hp);
            wallTextures[slot]!.needsUpdate = true;
          }
          node(`wall-label-${slot}`).setVisible(true).setPosition(0, 0, -(wall.z + back));
        }

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
          powerups.place(slot, p.x, bob, scrollFrameZ(runZ, 0), time * 1.5, 1, 1, 1);
        }

        /* ball, decal, shadow, shield */
        const ballY = DIMS.BALL_RADIUS;
        const roll = -travelled / DIMS.BALL_RADIUS;
        node("ball").setPosition(laneX, ballY, 0).setRotation(roll, 0, 0);
        if (o.number !== lastNumber) {
          lastNumber = o.number;
          paintNumber(numberCanvas.g, o.number);
          numberTexture.needsUpdate = true;
        }
        node("ball-label").setPosition(laneX, ballY + 0.05, DIMS.BALL_RADIUS + 0.08);
        node("ball-shadow").setPosition(laneX, 0.03, 0);
        if (o.shieldActive !== lastShield) {
          lastShield = o.shieldActive;
          node("shield").setVisible(o.shieldActive);
        }
        if (o.shieldActive) node("shield").setPosition(laneX, ballY, 0);

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
        for (const id of ["deck", "edges", "edge-glow", "dashes", "gate-panels", "gate-frames", "walls", "powerups"] as const) {
          node(id).setPosition(0, 0, frameZ);
        }
        deck.flush(node("deck"));
        edges.flush(node("edges"), false);
        edgeGlow.flush(node("edge-glow"), false);
        dashes.flush(node("dashes"), false);
        panels.flush(node("gate-panels"));
        frames.flush(node("gate-frames"));
        walls.flush(node("walls"));
        powerups.flush(node("powerups"));
        particles.flush(node("particles"), false);
        shards.flush(node("shards"));

        /* camera */
        const cam = view.shown?.cam ?? { x: 0.45 * laneX, y: LOOK.camera.height, z: LOOK.camera.back, lookX: laneX * 0.6, lookY: 1, lookZ: LOOK.camera.lookAheadZ };
        const baseFov = aspect >= 1 ? LOOK.camera.fovDeg : LOOK.camera.fovDeg + 25 * Math.min(1, (1 - aspect) / 0.5);
        const punch = view.reducedMotion ? 0 : (view.fovPunch ?? 0);
        controller.setPose({ position: [cam.x, cam.y, cam.z], target: [cam.lookX, cam.lookY, cam.lookZ], up: [0, 1, 0], fov: baseFov + punch }, { cut: false });
      }

      function warm(on: boolean): void {
        node("shield").setVisible(on);
        if (on) node("shield").setPosition(0, -50, -60);
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