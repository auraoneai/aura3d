/**
 * Drift & Deliver port: the visual layer. Lit PBR city (facade textures with metric UVs, shopfronts, awnings, tiered
 * crowns), a painted road tile, parks, street furniture, a skyline ring, low-poly cars, an HDRI-lit sun with cascaded
 * shadows, exp2 haze, AO, bloom, grade and vignette. Simulation state is read, never written.
 *
 * Public `@aura3d/engine` surface only. The original's textures, models and audio are not used: facades, roads and
 * cars are painted or built in code; the sky HDRI is CC0 (Poly Haven, see assets/ATTRIBUTION.md).
 */
import { camera, defineAuraAssets, effects, environments, geometry, instances, lights, material, primitives, scene, texture } from "@aura3d/engine";
import { CAR_KINDS, buildCarShell, type CarKind, type CarShell } from "./vehicles";
import { TRAFFIC_MODEL, carModel } from "./models";
import { planProps, propNodes, type PropPlan } from "./props";
import { GROUND_HALF, WALLS, blockDecals, buildCity, buildFurniture, buildProps, facadeKey, farCity, roadPlane, type Furniture } from "./city";
import { farCitySpec, skySpec } from "./sky";
import { PALETTE_SLOTS, Palette, bakePaletteUVs, createMesh, quad, toArrays, type MeshData } from "./mesh";
import { paintFacade, paintPalette, paintPark, paintPlaza, paintRoadTile, paintShopfront, paintSky, type FacadeKind } from "./textures";
import type { Block, Building, Pickup, TrafficCar } from "./world";

type TextureHandle = ReturnType<typeof texture.canvas>;
type Matrix = number[];

export const ASSETS = defineAuraAssets({
  skyHdr: { type: "texture", format: "hdr", url: new URL("./assets/sky.hdr", import.meta.url).href, metadata: { license: "CC0 1.0, Poly Haven kloppenheim_06_puresky (1k)" } }
});

export const FOG = { color: "#f0dcc0", density: 0.0024 } as const;

/* ------------------------------------------------------------------ matrices */

/** Column-major TRS: yaw about +y, then pitch about the local x axis, then non-uniform scale. */
export function mat(x: number, y: number, z: number, yaw: number, pitch: number, sx: number, sy: number, sz: number): Matrix {
  const cy = Math.cos(yaw);
  const sn = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  return [cy * sx, 0, -sn * sx, 0, sn * sp * sy, cp * sy, cy * sp * sy, 0, sn * cp * sz, -sp * sz, cy * cp * sz, 0, x, y, z, 1];
}

/** A cylinder lying on its side with its axis along the car's x axis (a wheel), at `(x, y, z)`. */
export function wheelMat(x: number, y: number, z: number, yaw: number, diameter: number, thickness: number): Matrix {
  const cy = Math.cos(yaw);
  const sn = Math.sin(yaw);
  return [0, diameter, 0, 0, -cy * thickness, 0, sn * thickness, 0, sn * diameter, 0, cy * diameter, 0, x, y, z, 1];
}

/** A coin standing on its edge, facing along `yaw`. */
export function coinMat(x: number, y: number, z: number, yaw: number, diameter: number, thickness: number): Matrix {
  const cy = Math.cos(yaw);
  const sn = Math.sin(yaw);
  return [cy * diameter, 0, -sn * diameter, 0, sn * thickness, 0, cy * thickness, 0, 0, -diameter, 0, 0, x, y, z, 1];
}

const local = (yaw: number, lx: number, lz: number): [number, number] => [lx * Math.cos(yaw) + lz * Math.sin(yaw), -lx * Math.sin(yaw) + lz * Math.cos(yaw)];

/* ------------------------------------------------------------------ textures */

function canvas(w: number, h: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, g: c.getContext("2d")! };
}

/** The compiler binds live texture handles in the `texture` slot; the public type only names asset refs. */
const asRef = (t: TextureHandle): never => t as never;

function repeating(t: TextureHandle): TextureHandle {
  t.wrapS = "repeat";
  t.wrapT = "repeat";
  return t;
}

export interface Textures {
  road: TextureHandle;
  park: TextureHandle;
  plaza: TextureHandle;
  sky: TextureHandle;
  facade: Record<string, { albedo: TextureHandle; emissive: TextureHandle }>;
  shop: { albedo: TextureHandle; emissive: TextureHandle };
}

export function paintTextures(quality: "high" | "low"): Textures {
  const roadPx = quality === "high" ? 2048 : 1024;
  const road = canvas(roadPx, roadPx);
  paintRoadTile(road.g, roadPx);
  const park = canvas(512, 512);
  paintPark(park.g, 512);
  const plaza = canvas(512, 512);
  paintPlaza(plaza.g, 512);
  const sky = canvas(8, 256);
  paintSky(sky.g, 8, 256);
  const facadePx = quality === "high" ? 1024 : 512;
  const facade: Textures["facade"] = {};
  (["tower", "apartment", "brick"] as const).forEach((kind, k) => {
    WALLS[kind].forEach((wall, v) => {
      const a = canvas(facadePx, facadePx);
      const e = canvas(facadePx, facadePx);
      paintFacade(kind, a.g, e.g, facadePx, k * 7 + v + 1, wall);
      facade[facadeKey(kind, v)] = { albedo: repeating(texture.canvas({ canvas: a.c, colorSpace: "srgb" })), emissive: repeating(texture.canvas({ canvas: e.c, colorSpace: "srgb" })) };
    });
  });
  const sa = canvas(1024, 256);
  const se = canvas(1024, 256);
  paintShopfront(sa.g, se.g, 1024, 256);
  return {
    road: repeating(texture.canvas({ canvas: road.c, colorSpace: "srgb" })),
    park: texture.canvas({ canvas: park.c, colorSpace: "srgb" }),
    plaza: texture.canvas({ canvas: plaza.c, colorSpace: "srgb" }),
    sky: texture.canvas({ canvas: sky.c, colorSpace: "srgb" }),
    facade,
    shop: { albedo: repeating(texture.canvas({ canvas: sa.c, colorSpace: "srgb" })), emissive: repeating(texture.canvas({ canvas: se.c, colorSpace: "srgb" })) }
  };
}

/* ------------------------------------------------------------------ build */

export interface TrafficRig {
  kind: CarKind;
  cars: number[];
  paint: ReturnType<typeof instances.mesh>;
  detail: ReturnType<typeof instances.mesh>;
}

export interface LookRig {
  builder: ReturnType<typeof scene>;
  traffic: TrafficRig[];
  /** car indices drawn as generated models (`traffic-<i>` runtime nodes); empty when the instanced shells are used */
  modelTraffic: number[];
  coinMesh: ReturnType<typeof instances.mesh>;
  starMesh: ReturnType<typeof instances.mesh>;
  heartMesh: ReturnType<typeof instances.mesh>;
  coins: Pickup[];
  stars: Pickup[];
  hearts: Pickup[];
  furniture: Furniture;
  playerShell: CarShell;
  palette: TextureHandle;
  stats: { cityTriangles: number; chunks: number; awnings: number; tallest: number; lamps: number; trees: number; pedestrians: number; propTriangles: number };
}

const PAINTS = ["#c9402a", "#2f3138", "#3c8fcf", "#e0a02a", "#d8d2c4", "#5f8a45", "#8a2f4d", "#e9e4da"];
const LEAF = ["#6f9a45", "#7aa84e", "#5f8a3e", "#86b05a", "#6a9f58"];

const geo = (m: MeshData, _name: string) => {
  const a = toArrays(m);
  return geometry.define({ positions: a.positions, normals: a.normals, uvs: a.uvs, colors: a.colors, indices: a.indices });
};

/**
 * Hemisphere "sky-fill" intensity. Up to 4.5.0 the engine dropped an authored hemisphere next to an environment node
 * (LIGHT-05), so the shipped HDRI frame never had this fill; the 1.7 only lit the lights-only `env=0` path (heal rung
 * `no-env`). With the hemisphere now adding to the HDRI, 1.7 lifts the steady-state frame by 10.7% (mean luma 108.2 to
 * 119.8, lane E2). Next to the HDRI the fill is kept small so the shipped frame holds; the lights-only path keeps 1.7.
 */
export const SKY_FILL = { withEnv: 0.3, lightsOnly: 1.7 } as const;

/** Sky-fill intensity for the light rig; `override` is the `skyfill=` diagnostics switch. */
export function skyFillIntensity(env: boolean, override?: number): number {
  if (override !== undefined && Number.isFinite(override) && override >= 0) return override;
  return env ? SKY_FILL.withEnv : SKY_FILL.lightsOnly;
}

export function buildLook(world: { blocks: readonly Block[]; buildings: readonly Building[]; traffic: readonly TrafficCar[]; pickups: readonly Pickup[] }, opts: { models: boolean; quality: "high" | "low"; ao: boolean; env: boolean; shadow: boolean; fog: boolean; post: boolean; aa?: boolean; sky: boolean; sun: number; skyFill?: number; roadCells?: number; start: { x: number; z: number } }): LookRig {
  const high = opts.quality === "high";
  const tex = paintTextures(opts.quality);
  const city = buildCity(world.blocks, world.buildings);
  const furniture = buildFurniture(world.blocks);
  // solid colours (awnings, roofs, trims, car glass and lamps) sample one palette strip, baked into the UVs
  const palette = new Palette();
  for (const chunk of city.chunks) bakePaletteUVs(chunk.meshes.trim as MeshData, palette);
  const shells = new Map<CarKind, CarShell>(CAR_KINDS.map((k) => [k, buildCarShell(k)] as const));
  const playerShell = buildCarShell("sedan");
  for (const shell of [...shells.values(), playerShell]) bakePaletteUVs(shell.detail, palette);
  const far = farCity();
  bakePaletteUVs(far, palette);
  const propPlan: PropPlan | null = opts.models ? planProps(furniture, world.blocks, world.buildings, opts.start) : null;
  const props = buildProps(furniture, propPlan?.skip);
  bakePaletteUVs(props, palette);
  const paletteCanvas = canvas(PALETTE_SLOTS * 16, 16);
  paintPalette(paletteCanvas.g, palette.hexes, PALETTE_SLOTS);
  const paletteTex = texture.canvas({ canvas: paletteCanvas.c, colorSpace: "srgb" });
  paletteTex.generateMipmaps = false;

  const b = scene()
    .background({ texture: asRef(tex.sky) })
    .camera(camera.perspective({ position: [opts.start.x, 4.3, opts.start.z - 10.6], target: [opts.start.x, 1.25, opts.start.z + 5], fov: 56, near: 0.4, far: 2400 }));

  // ---- light rig, atmosphere and post ----
  if (opts.env) b.add(environments.hdri({ name: "env-sky", texture: ASSETS.skyHdr, intensity: 1.0, background: false, color: "#ffc890" }));
  b.add(lights.directional({ name: "sun", position: [-88, 38, -50], target: [0, 0, 0], intensity: opts.sun, color: "#ffbf80", shadow: high && opts.shadow ? { cascades: 2, maxDistance: 150, blend: 0.12, mapSize: 2048 } : false }).runtime({ id: "sun" }));
  b.add(lights.hemisphere({ name: "sky-fill", skyColor: "#ffe0b0", groundColor: "#c9a070", intensity: skyFillIntensity(opts.env, opts.skyFill) }));
  if (opts.fog) b.add(effects.fog({ name: "haze", color: FOG.color, density: FOG.density }));
  if (high && opts.ao) b.add(effects.ambientOcclusion({ name: "ao" }));
  if (opts.post) {
    b.add(effects.bloom({ name: "bloom", intensity: 0.35, threshold: 1.05, radius: 0.35 }));
    b.add(effects.colorGrade({ name: "grade", contrast: 1.06, saturation: 1.38 }));
    b.add(effects.vignette({ name: "vignette", intensity: 0.2, smoothness: 0.7 }));
    if (opts.aa !== false) b.add(effects.antiAlias({ name: "aa", mode: "fxaa" }));
  }

  if (opts.sky) b.add(primitives.sphere({ name: "sky-dome", size: 3600, material: material.custom(skySpec()), castShadow: false, receiveShadow: false }));

  // ---- ground, roads, parks, water ----
  b.add(geometry.custom(geo(roadPlane(opts.roadCells), "road"), { name: "road-tiles", material: material.pbr({ color: "#ffffff", roughness: 0.88, texture: asRef(tex.road), textureAnisotropy: 8 }), castShadow: false, receiveShadow: true }));
  b.add(geometry.custom(geo(blockDecals(world.blocks, "park", 21.5), "parks"), { name: "parks", material: material.pbr({ color: "#ffffff", roughness: 0.95, texture: asRef(tex.park) }), castShadow: false, receiveShadow: true }));
  b.add(geometry.custom(geo(blockDecals(world.blocks, "plaza", 21.5), "plazas"), { name: "plazas", material: material.pbr({ color: "#ffffff", roughness: 0.9, texture: asRef(tex.plaza) }), castShadow: false, receiveShadow: true }));
  b.add(geometry.custom(geo(outerGround(), "outer"), { name: "outer-ground", material: material.pbr({ color: "#9a9468", roughness: 1 }), castShadow: false, receiveShadow: true }));
  b.add(geometry.custom(geo(waterPlane(), "water"), { name: "harbour", material: material.pbr({ color: "#3f8fb0", roughness: 0.16, metallic: 0.05 }), castShadow: false, receiveShadow: false }));
  if (opts.sky) b.add(geometry.custom(geo(far, "far-city"), { name: "far-city", material: material.custom(farCitySpec(paletteTex)), castShadow: false, receiveShadow: false }));

  // ---- the city itself ----
  const facadeMat = (key: string) => material.pbr({ color: "#ffffff", roughness: 0.82, metallic: 0.02, texture: asRef(tex.facade[key]!.albedo), emissiveMap: tex.facade[key]!.emissive, emissive: "#ffffff", emissiveIntensity: 0.6, textureAnisotropy: 8 });
  const shopMat = material.pbr({ color: "#ffffff", roughness: 0.7, texture: asRef(tex.shop.albedo), emissiveMap: tex.shop.emissive, emissive: "#ffffff", emissiveIntensity: 0.7, textureAnisotropy: 8 });
  const solidMat = material.pbr({ color: "#ffffff", roughness: 0.78, texture: asRef(paletteTex) });
  for (const chunk of city.chunks) {
    for (const [key, m] of Object.entries(chunk.meshes)) {
      if (!m.indices.length) continue;
      const mat = key === "shop" ? shopMat : key === "trim" ? solidMat : facadeMat(key);
      b.add(geometry.custom(geo(m, key), { name: `city-${chunk.key}-${key.replace(":", "-")}`, material: mat, castShadow: true, receiveShadow: true }));
    }
  }

  // ---- street furniture, trees and pedestrians: one merged static mesh in palette colours ----
  b.add(geometry.custom(geo(props, "props"), { name: "props", material: material.pbr({ color: "#ffffff", roughness: 0.82, texture: asRef(paletteTex) }), castShadow: false, receiveShadow: true }));

  // ---- generated prop models: near-field lamps, signals, trees, hydrants, shelters and the landmarks ----
  if (propPlan) for (const n of propNodes(propPlan)) b.add(n);

  // ---- traffic: paint + detail shells per kind, wheels and hubs ----
  const modelTraffic: number[] = [];
  if (opts.models) {
    world.traffic.forEach((_, i) => {
      b.add(carModel(`traffic-${i}`, TRAFFIC_MODEL[CAR_KINDS[i % CAR_KINDS.length] as CarKind], false));
      modelTraffic.push(i);
    });
  }
  const traffic: TrafficRig[] = (opts.models ? [] : CAR_KINDS).map((kind) => {
    const cars = world.traffic.map((_, i) => i).filter((i) => i % CAR_KINDS.length === CAR_KINDS.indexOf(kind));
    const shell = shells.get(kind)!;
    const paint = instances.mesh(geo(shell.paint, `${kind}-paint`), material.carPaint({ color: "#ffffff", roughness: 0.4, metallic: 0.2, clearcoat: 0.4, envMapIntensity: 0.45 }), cars.length);
    const detail = instances.mesh(geo(shell.detail, `${kind}-detail`), material.pbr({ color: "#ffffff", roughness: 0.4, metallic: 0.1, texture: asRef(paletteTex) }), cars.length);
    cars.forEach((carIndex, n) => paint.setColorAt(n, PAINTS[(carIndex * 5 + CAR_KINDS.indexOf(kind)) % PAINTS.length] as string));
    b.add(paint).add(detail);
    return { kind, cars, paint, detail };
  });

  // ---- pickups ----
  const coins = world.pickups.filter((p) => p.kind === "coin");
  const stars = world.pickups.filter((p) => p.kind === "star");
  const hearts = world.pickups.filter((p) => p.kind === "heart");
  const coinMesh = instances.mesh("cylinder", material.emissive({ color: "#ffd15c", emissive: "#ffb300", emissiveIntensity: 1.2 }), coins.length);
  const starMesh = instances.mesh("polyhedron", material.emissive({ color: "#fff0a8", emissive: "#ffd54a", emissiveIntensity: 1.3 }), stars.length);
  const heartMesh = instances.mesh("sphere", material.emissive({ color: "#ff8aa8", emissive: "#ff4d79", emissiveIntensity: 1.2 }), hearts.length);
  b.add(coinMesh).add(starMesh).add(heartMesh);

  return {
    builder: b,
    traffic,
    modelTraffic,
    coinMesh,
    starMesh,
    heartMesh,
    coins,
    stars,
    hearts,
    furniture,
    playerShell,
    palette: paletteTex,
    stats: { cityTriangles: city.stats.triangles, chunks: city.stats.chunks, awnings: city.stats.awnings, tallest: city.stats.tallest, lamps: furniture.lamps.length, trees: furniture.streetTrees.length + furniture.parkTrees.length, pedestrians: furniture.pedestrians.length, propTriangles: props.indices.length / 3 }
  };
}

/* ------------------------------------------------------------------ small geometry */


/**
 * The terrain around the road square. It is a frame with a hole where the road lies, never a full plane under it: a
 * plane 3 cm below the road competes with the road in the depth buffer on a coarse depth buffer (one depth step at 30 m
 * on a 16-bit buffer is about 3 cm), and a tie goes to the later-drawn layer. Hardening only: the road flip seen in
 * the first frames was reproduced with and without this change (see the render-fix README).
 */
export function outerGroundRects(): readonly (readonly [number, number, number, number])[] {
  const h = 1600;
  const r = GROUND_HALF;
  // [x0, z0, x1, z1]
  return [
    [-h, r, h, h], // north strip
    [-h, -h, h, -r], // south strip
    [-h, -r, -r, r], // west strip
    [r, -r, h, r] // east strip
  ];
}

export function outerGround(): MeshData {
  const m = createMesh();
  for (const [x0, z0, x1, z1] of outerGroundRects()) quad(m, [x0, -0.03, z1], [x1 - x0, 0, 0], [0, 0, -(z1 - z0)], [1, 1, 1], [0, 0], [1, 1]);
  return m;
}

export function waterPlane(): MeshData {
  const m = createMesh();
  quad(m, [-1600, 0.02, 1700], [3200, 0, 0], [0, 0, -1190], [1, 1, 1], [0, 0], [1, 1]);
  return m;
}

export { GROUND_HALF };
