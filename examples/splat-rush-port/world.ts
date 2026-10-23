/**
 * Splat Rush world on the public `@aura3d/engine` surface only: toon-shaded `material.custom` surfaces,
 * `geometry.dynamic` meshes (exact three.js dimensions, see `meshes.ts`), `texture.canvas` textures painted from
 * the values the simulation drew, and per-frame runtime-node updates read straight from `SplatRushSim`.
 * The original's `InstancedMesh` road (deck, rails, lane marks) becomes three `geometry.dynamic` batches whose
 * positions/normals are rewritten in place each frame.
 */
import { camera, geometry, material, scene, texture, type AuraApp } from "@aura3d/engine";
import { COLORS, CONFIG, POOL, type SplatRushSim } from "./sim";
import { blobMesh, capsuleMesh, coneMesh, cylinderMesh, mergeMeshes, sphereMesh, transformMesh, type MeshData } from "./meshes";
import { FLAT_FRAGMENT, FLAT_VERTEX, SKY_FRAGMENT, SKY_VERTEX, TOON_VERTEX, toonFragment } from "./shaders";

type Rgb = readonly [number, number, number];
type Scene = ReturnType<typeof scene>;
type TextureHandle = ReturnType<typeof texture.canvas>;
type NodeHandle = ReturnType<AuraApp["nodes"]["require"]>;

const f32 = (a: readonly number[]): Float32Array => Float32Array.from(a);

export const hexLinear = (hex: string): Rgb => {
  const v = parseInt(hex.slice(1), 16);
  const lin = (c: number): number => {
    const s = c / 255;
    return s < 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return [lin((v >> 16) & 255), lin((v >> 8) & 255), lin(v & 255)];
};

const hslToLinear = (h: number, s: number, l: number): Rgb => {
  const k = (n: number): number => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const lin = (c: number): number => (c < 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return [lin(f(0)), lin(f(8)), lin(f(4))];
};

type CustomSpec = Parameters<typeof material.custom>[0];

export const toonSpec = (base: Rgb, map?: TextureHandle, emissive: Rgb = [0, 0, 0]): CustomSpec => ({
  glsl: { vertex: TOON_VERTEX, fragment: toonFragment(map !== undefined) },
  uniforms: {
    baseColor: { type: "color3", value: [...base] },
    emissive: { type: "color3", value: [...emissive] },
    alpha: { type: "f32", value: 1 },
    ...(map ? { map: { type: "texture2d" as const, value: map } } : {})
  },
  side: "double"
});

export const flatSpec = (base: Rgb, alpha: number): CustomSpec => ({
  glsl: { vertex: FLAT_VERTEX, fragment: FLAT_FRAGMENT },
  uniforms: { baseColor: { type: "color3", value: [...base] }, alpha: { type: "f32", value: alpha } },
  transparent: true,
  depthWrite: false,
  side: "double"
});

export const skySpec = (): CustomSpec => ({ glsl: { vertex: SKY_VERTEX, fragment: SKY_FRAGMENT }, side: "double", depthWrite: false });

/** One of each distinct program, so a unit test can compile exactly what the app draws with. */
export const allProgramSpecs = (): readonly { readonly name: string; readonly spec: CustomSpec }[] => [
  { name: "toon", spec: toonSpec([0.5, 0.5, 0.5]) },
  { name: "toon-map", spec: toonSpec([0.5, 0.5, 0.5], texture.data({ width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255]) }) as unknown as TextureHandle) },
  { name: "sky", spec: skySpec() },
  { name: "flat", spec: flatSpec([1, 1, 1], 0.4) }
];

/* ---------------------------------------------------------------- canvases (painted from the sim's own draws) */

export function paintBallCanvas(sim: SplatRushSim): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  g.fillStyle = "#f0433a";
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = "rgba(255,255,255,0.15)";
  for (const [x, y, rx, ry, rot] of sim.paint.ball as [number, number, number, number, number][]) {
    g.beginPath();
    g.ellipse(x, y, rx, ry, rot, 0, 2 * Math.PI);
    g.fill();
  }
  return c;
}

export function paintRampCanvas(sim: SplatRushSim): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  g.fillStyle = "#fdf0e0";
  g.fillRect(0, 0, 512, 512);
  g.fillStyle = "rgba(0,0,0,0.025)";
  for (const [x, y] of sim.paint.speckles as [number, number][]) g.fillRect(x, y, 1.5, 1.5);
  const colors = ["rgba(240,67,58,0.55)", "rgba(249,198,71,0.50)", "rgba(94,202,240,0.50)", "rgba(184,104,232,0.45)"];
  for (const b of sim.paint.blobs) {
    g.fillStyle = colors[b.colorIndex] as string;
    g.beginPath();
    g.moveTo(b.x + b.r, b.y);
    for (let i = 0; i < 6; i++) {
      const s3 = (i / 6) * Math.PI * 2, r3 = ((i + 1) / 6) * Math.PI * 2;
      const [l3, p2] = b.lobes[i] as [number, number];
      g.bezierCurveTo(b.x + Math.cos(s3) * l3 * 1.2, b.y + Math.sin(s3) * l3 * 1.2, b.x + Math.cos(r3) * p2 * 1.2, b.y + Math.sin(r3) * p2 * 1.2, b.x + Math.cos(r3) * p2, b.y + Math.sin(r3) * p2);
    }
    g.closePath();
    g.fill();
  }
  return c;
}

/* ---------------------------------------------------------------- dynamic mesh batches */

function dynamicFrom(m: MeshData) {
  return geometry.dynamic({ positions: f32(m.positions), normals: f32(m.normals), uvs: f32(m.uvs), indices: Uint32Array.from(m.indices) });
}

/** `count` copies of one template mesh whose per-instance placement is rewritten each frame. */
class Batch {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly vertsPer: number;
  readonly mesh: MeshData;
  used = 0;
  constructor(template: MeshData, readonly max: number) {
    this.vertsPer = template.positions.length / 3;
    const merged = mergeMeshes(Array.from({ length: max }, () => template));
    this.mesh = merged;
    this.positions = Float32Array.from(merged.positions);
    this.normals = Float32Array.from(merged.normals);
    this.template = template;
  }
  private template: MeshData;
  /** Place instance `i` at (x, y, z) with yaw about Y and per-axis scale. */
  place(i: number, x: number, y: number, z: number, yaw: number, sx: number, sy: number, sz: number): void {
    const t = this.template, c = Math.cos(yaw), s = Math.sin(yaw), base = i * this.vertsPer * 3;
    for (let v = 0; v < this.vertsPer; v++) {
      const k = v * 3;
      const lx = (t.positions[k] as number) * sx, ly = (t.positions[k + 1] as number) * sy, lz = (t.positions[k + 2] as number) * sz;
      this.positions[base + k] = x + lx * c + lz * s;
      this.positions[base + k + 1] = y + ly;
      this.positions[base + k + 2] = z - lx * s + lz * c;
      const nx = (t.normals[k] as number) / sx, ny = (t.normals[k + 1] as number) / sy, nz = (t.normals[k + 2] as number) / sz;
      const inv = 1 / (Math.hypot(nx, ny, nz) || 1);
      this.normals[base + k] = (nx * c + nz * s) * inv;
      this.normals[base + k + 1] = ny * inv;
      this.normals[base + k + 2] = (-nx * s + nz * c) * inv;
    }
  }
  /** Collapse every instance from `used` to `max` to a point. */
  hideFrom(used: number): void {
    for (let i = used; i < Math.min(this.max, this.used); i++) this.positions.fill(0, i * this.vertsPer * 3, (i + 1) * this.vertsPer * 3);
    this.used = used;
  }
}

const boxMesh = (w: number, h: number, d: number): MeshData => {
  const m: MeshData = { positions: [], normals: [], uvs: [], indices: [] };
  const faces: [number, number, number, number[][]][] = [
    [1, 0, 0, [[w / 2, -h / 2, d / 2], [w / 2, -h / 2, -d / 2], [w / 2, h / 2, -d / 2], [w / 2, h / 2, d / 2]]],
    [-1, 0, 0, [[-w / 2, -h / 2, -d / 2], [-w / 2, -h / 2, d / 2], [-w / 2, h / 2, d / 2], [-w / 2, h / 2, -d / 2]]],
    [0, 1, 0, [[-w / 2, h / 2, d / 2], [w / 2, h / 2, d / 2], [w / 2, h / 2, -d / 2], [-w / 2, h / 2, -d / 2]]],
    [0, -1, 0, [[-w / 2, -h / 2, -d / 2], [w / 2, -h / 2, -d / 2], [w / 2, -h / 2, d / 2], [-w / 2, -h / 2, d / 2]]],
    [0, 0, 1, [[-w / 2, -h / 2, d / 2], [w / 2, -h / 2, d / 2], [w / 2, h / 2, d / 2], [-w / 2, h / 2, d / 2]]],
    [0, 0, -1, [[w / 2, -h / 2, -d / 2], [-w / 2, -h / 2, -d / 2], [-w / 2, h / 2, -d / 2], [w / 2, h / 2, -d / 2]]]
  ];
  for (const [nx, ny, nz, quad] of faces) {
    const base = m.positions.length / 3;
    quad.forEach((p, i) => {
      m.positions.push(p[0] as number, p[1] as number, p[2] as number);
      m.normals.push(nx, ny, nz);
      m.uvs.push(i === 0 || i === 3 ? 0 : 1, i < 2 ? 0 : 1);
    });
    m.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return m;
};

/* ---------------------------------------------------------------- build */

export interface WorldOptions {
  readonly sim: SplatRushSim;
  readonly aspect: number;
}

export interface World {
  readonly scene: Scene;
  readonly textures: { readonly ball: TextureHandle; readonly ramp: TextureHandle };
  bind(app: AuraApp): WorldRuntime;
}

export interface WorldRuntime {
  update(sim: SplatRushSim, aspect: number): void;
  readonly nodeCount: number;
}

const MAX_SEG = 220;
const GATE_MAX = POOL.gates;

export function buildWorld(options: WorldOptions): World {
  const { sim } = options;
  const ballTex = texture.canvas({ canvas: paintBallCanvas(sim), colorSpace: "linear" });
  const rampTex = texture.canvas({ canvas: paintRampCanvas(sim), colorSpace: "linear" });
  const builder: Scene = scene()
    .background("#bfdcee")
    .camera(camera.perspective({ position: [0, 15, 18], target: [0, 0, 0], fov: 55, near: 0.1, far: 500 }));

  const add = (id: string, mesh: MeshData, spec: CustomSpec): void => {
    builder.add(geometry.custom(dynamicFrom(mesh), { name: id, material: material.custom(spec) }).runtime({ id }));
  };

  /* sky backdrop (radius 120, centred on the origin like the original) */
  add("sky", sphereMesh(120, 32, 32), skySpec());

  /* player ball: sphere r 0.55, painted map x player colour */
  add("ball", sphereMesh(CONFIG.BALL_RADIUS, 32, 32), toonSpec(hexLinear(COLORS[0] as string), ballTex));

  /* road batches */
  const deck = new Batch(boxMesh(8, 0.3, 1), MAX_SEG);
  const rails = new Batch(sphereMesh(1, 8, 6), MAX_SEG * 2);
  const dashes = new Batch(boxMesh(0.15, 0.02, 1.2), 60);
  const spread = (b: Batch, n: number): void => {
    for (let i = 0; i < n; i++) b.place(i, 0, 0, 20 - i * 0.9, 0, 1, 1, 1);
  };
  spread(deck, MAX_SEG);
  for (let i = 0; i < MAX_SEG * 2; i++) rails.place(i, i % 2 === 0 ? -4.3 : 4.3, 0.3, 20 - Math.floor(i / 2) * 0.9, 0, 0.32, 0.32, 0.235);
  for (let i = 0; i < 60; i++) dashes.place(i, 0, 0.01, 20 - i * 3.6, 0, 1, 1, 1);
  builder.add(geometry.custom(dynamicFrom(deck.mesh), { name: "deck", material: material.custom(toonSpec(hexLinear("#fdf0e0"), rampTex)) }).runtime({ id: "deck" }));
  builder.add(geometry.custom(dynamicFrom(rails.mesh), { name: "rails", material: material.custom(toonSpec(hexLinear("#c3b1f0"))) }).runtime({ id: "rails" }));
  builder.add(geometry.custom(dynamicFrom(dashes.mesh), { name: "dashes", material: material.custom(toonSpec([1, 1, 1])) }).runtime({ id: "dashes" }));

  /* gates: two posts + bar, merged, scaled 0.32 like the original group */
  const post = capsuleMesh(0.46, 4, 16, 6);
  const bar = capsuleMesh(0.52, 6.24, 16, 6);
  const gateMesh = transformMesh(
    mergeMeshes([transformMesh(post, { tx: -2.66, ty: 2 + 0.46 }), transformMesh(post, { tx: 2.2 + 0.46, ty: 2 + 0.46 }), transformMesh(bar, { rz: Math.PI / 2, ty: 4.92 })]),
    { scale: 0.32 }
  );
  for (let i = 0; i < GATE_MAX; i++) add(`gate-${i}`, gateMesh, toonSpec(hexLinear(COLORS[0] as string)));

  /* power-ups: sphere + cone */
  const powerMesh = mergeMeshes([sphereMesh(0.4, 20, 16), coneMesh(0.4, 0.8, 20, 0.4)]);
  for (let i = 0; i < POOL.powerups; i++) add(`powerup-${i}`, powerMesh, toonSpec(hexLinear("#b868e8")));

  /* splatters: flat blob + two small discs */
  const splatMesh = mergeMeshes([
    transformMesh(blobMesh(1.5, 0.02), {}),
    transformMesh(cylinderMesh(0.15, 0.15, 0.05, 16), { tx: 1.5, ty: 0.02, tz: 1.2 }),
    transformMesh(cylinderMesh(0.15, 0.15, 0.05, 16), { tx: -1.2, ty: 0.02, tz: -1.5 })
  ]);
  for (let i = 0; i < POOL.splatters; i++) add(`splat-${i}`, splatMesh, toonSpec(hexLinear(COLORS[0] as string)));

  /* particles + clouds + streaks + shield */
  const particleMesh = sphereMesh(0.13, 6, 6);
  for (let i = 0; i < POOL.particles; i++) add(`particle-${i}`, particleMesh, toonSpec([1, 1, 1]));
  const puff = mergeMeshes([
    sphereMesh(2.5, 14, 10),
    sphereMesh(1.8, 14, 10, -2, -0.5, 0),
    sphereMesh(1.5, 14, 10, 2, -0.8, 0.5),
    sphereMesh(1.2, 14, 10, 1, -1, -1)
  ]);
  for (let i = 0; i < 56; i++) add(`cloud-${i}`, puff, toonSpec(i < 30 ? [1, 1, 1] : hexLinear("#eaf4ff")));
  for (let i = 0; i < 50; i++) add(`streak-${i}`, boxMesh(0.08, 0.08, 4), flatSpec([1, 1, 1], 0.4));
  add("shield", sphereMesh(1, 24, 16), flatSpec(hexLinear("#8fe3ff"), 0.28));

  return {
    scene: builder,
    textures: { ball: ballTex, ramp: rampTex },
    bind(app: AuraApp): WorldRuntime {
      const handles = new Map<string, NodeHandle>();
      const node = (id: string): NodeHandle => {
        let h = handles.get(id);
        if (!h) handles.set(id, (h = app.nodes.require(id)));
        return h;
      };
      const maybeController = app.camera;
      if (!maybeController) throw new Error("splat-rush-port: the app exposes no camera controller");
      const controller: NonNullable<typeof maybeController> = maybeController;
      const hide = (id: string): void => void node(id).setVisible(false);
      for (let i = 0; i < GATE_MAX; i++) hide(`gate-${i}`);
      for (let i = 0; i < POOL.powerups; i++) hide(`powerup-${i}`);
      for (let i = 0; i < POOL.splatters; i++) hide(`splat-${i}`);
      for (let i = 0; i < POOL.particles; i++) hide(`particle-${i}`);
      hide("shield");

      const gateColor: number[] = Array.from({ length: GATE_MAX }, () => -1);
      const splatColor: number[] = Array.from({ length: POOL.splatters }, () => -1);
      const powerType: string[] = Array.from({ length: POOL.powerups }, () => "");
      const particleColor: string[] = Array.from({ length: POOL.particles }, () => "");
      let ballColorKey = "";
      let lastFov = -1;

      const rainbow = (elapsed: number): Rgb => hslToLinear((0.6 * elapsed) % 1, 0.9, 0.62);

      function update(simNow: SplatRushSim, aspect: number): void {
        const o = simNow.o, p = simNow.player;
        /* ball */
        const ball = node("ball");
        ball.setPosition(p.x, p.y, p.z).setRotation(p.rotX, 0, 0).setScale(p.scale).setVisible(p.visible);
        const key = o.isRainbowActive ? "rainbow" : `c${o.playerColorIndex}`;
        const rgb = o.isRainbowActive ? rainbow(simNow.elapsed) : hexLinear(COLORS[o.playerColorIndex] as string);
        if (o.isRainbowActive || key !== ballColorKey) {
          ball.setUniform?.("baseColor", [...rgb]);
          ball.setUniform?.("emissive", o.isRainbowActive ? [0.3 * rgb[0], 0.3 * rgb[1], 0.3 * rgb[2]] : [0, 0, 0]);
          ballColorKey = key;
        }
        /* shield bubble */
        const shield = node("shield");
        shield.setVisible(o.shieldActive && p.visible);
        if (o.shieldActive) {
          shield.setPosition(p.x, p.y, p.z);
          shield.setScale(CONFIG.BALL_RADIUS * o.ballScale * 1.7 * (1 + 0.06 * Math.sin(8 * simNow.elapsed)));
        }
        /* road batches (positions + normals rewritten in place) */
        const segs = simNow.segments;
        segs.forEach((s, i) => {
          const r = -o.distance + s.z;
          const slope = 0.04 * Math.cos(0.04 * r) * CONFIG.CURVE_AMPLITUDE;
          const yaw = Math.atan(slope);
          deck.place(i, s.x, -0.15, s.z, yaw, 1, 1, 1);
          const cx = 4.3 * Math.cos(yaw), cz = 4.3 * Math.sin(yaw);
          rails.place(i * 2, s.x - cx, 0.3, s.z + cz, yaw, 0.32, 0.32, 0.235);
          rails.place(i * 2 + 1, s.x + cx, 0.3, s.z - cz, yaw, 0.32, 0.32, 0.235);
        });
        deck.hideFrom(segs.length);
        rails.hideFrom(segs.length * 2);
        let dash = 0;
        for (const s of segs) {
          if (s.index % 4 !== 0 || dash >= 60) continue;
          const yaw = Math.atan(0.04 * Math.cos(0.04 * (-o.distance + s.z)) * CONFIG.CURVE_AMPLITUDE);
          dashes.place(dash++, s.x, 0.01, s.z, yaw, 1, 1, 1);
        }
        dashes.hideFrom(dash);
        node("deck").updateAttribute?.("position", { array: deck.positions, offset: 0 });
        node("deck").updateAttribute?.("normal", { array: deck.normals, offset: 0 });
        node("rails").updateAttribute?.("position", { array: rails.positions, offset: 0 });
        node("rails").updateAttribute?.("normal", { array: rails.normals, offset: 0 });
        node("dashes").updateAttribute?.("position", { array: dashes.positions, offset: 0 });
        node("dashes").updateAttribute?.("normal", { array: dashes.normals, offset: 0 });
        /* gates */
        for (let i = 0; i < GATE_MAX; i++) {
          const g = simNow.gates[i];
          const h = node(`gate-${i}`);
          if (!g) { h.setVisible(false); continue; }
          h.setVisible(true).setPosition(g.x, 0, g.z);
          if (gateColor[i] !== g.colorIndex) { h.setUniform?.("baseColor", [...hexLinear(COLORS[g.colorIndex] as string)]); gateColor[i] = g.colorIndex; }
        }
        for (let i = 0; i < POOL.powerups; i++) {
          const pu = simNow.powerups[i];
          const h = node(`powerup-${i}`);
          if (!pu) { h.setVisible(false); continue; }
          h.setVisible(true).setPosition(pu.x, pu.y, pu.z);
          if (powerType[i] !== pu.type) {
            const c = pu.type === "rainbow" ? "#b868e8" : pu.type === "shield" ? "#5ecaf0" : pu.type === "x2" ? "#f9c647" : "#9ad4e8";
            h.setUniform?.("baseColor", [...hexLinear(c)]);
            powerType[i] = pu.type;
          }
        }
        for (let i = 0; i < POOL.splatters; i++) {
          const sp = simNow.splatters[i];
          const h = node(`splat-${i}`);
          if (!sp) { h.setVisible(false); continue; }
          h.setVisible(true).setPosition(sp.x, sp.y, sp.z).setRotation(0, sp.rotY, 0).setScale(sp.scale);
          if (splatColor[i] !== sp.colorIndex) { h.setUniform?.("baseColor", [...hexLinear(COLORS[sp.colorIndex] as string)]); splatColor[i] = sp.colorIndex; }
        }
        for (let i = 0; i < POOL.particles; i++) {
          const pa = simNow.particles[i] as SplatRushSim["particles"][number];
          const h = node(`particle-${i}`);
          if (!pa.visible) { h.setVisible(false); continue; }
          h.setVisible(true).setPosition(pa.x, pa.y, pa.z).setScale(pa.scale);
          if (particleColor[i] !== pa.color) { h.setUniform?.("baseColor", [...hexLinear(pa.color)]); particleColor[i] = pa.color; }
        }
        simNow.clouds.forEach((c, i) => node(`cloud-${i}`).setPosition(c.x, c.y, c.z).setRotation(0, c.r, 0).setScale(c.s));
        const stretch = (d: number, h2: number): number => 1 + 0.05 * d + 0.6 * h2;
        const d2 = o.phase === "playing" ? o.speed : 0.5 * CONFIG.FORWARD_SPEED_INIT;
        simNow.streaks.forEach((s, i) => node(`streak-${i}`).setPosition(s.x, s.y, s.z).setScale([1, 1, stretch(d2, simNow.speedRatio)]));
        /* camera */
        const c = simNow.camera;
        const baseFov = aspect >= 1 ? 55 : 55 + 25 * Math.min(1, (1 - aspect) / 0.5);
        const fov = baseFov + o._fovApplied;
        controller.setPose({ position: [c.x, c.y, c.z], target: [c.lookX, c.lookY, c.lookZ], up: [0, 1, 0], fov }, { cut: false });
        lastFov = fov;
      }
      void lastFov;
      return { update, get nodeCount() { return handles.size; } };
    }
  };
}
