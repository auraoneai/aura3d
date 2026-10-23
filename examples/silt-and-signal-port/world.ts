/**
 * Silt & Signal on Aura3D: the rendered world for one chapter, built on the public engine surface.
 * The sky dome is a port of the original's shader; ground, canal, objective rings and the bike are
 * stand-ins (the original's terrain generator and GLB models are not reproduced).
 */
import { camera, material, primitives, scene, type AuraApp } from "@aura3d/engine";
import { CHAPTERS } from "./chapters-data";
import { objectiveOf, type Sim } from "./sim";
import {
  BIKE_FRAGMENT, BIKE_VERTEX, GROUND_FRAGMENT, GROUND_VERTEX, RING_FRAGMENT, RING_VERTEX, SKY_FRAGMENT, SKY_VERTEX, WATER_FRAGMENT
} from "./shaders";

type Scene = ReturnType<typeof scene>;
export type Rgb = readonly [number, number, number];
export type CustomSpec = Parameters<typeof material.custom>[0];

const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
/** 0xRRGGBB (sRGB) to a linear triple, the working space three.js uses for `Color(hex)`. */
export const hexLinear = (hex: number): Rgb => [srgbToLinear(((hex >> 16) & 255) / 255), srgbToLinear(((hex >> 8) & 255) / 255), srgbToLinear((hex & 255) / 255)];

/** The original picks the sky colours per chapter, falling back to the palette (`D` in the bundle). */
export function skyColors(chapter: number): { top: Rgb; bottom: Rgb; night: number } {
  const ch = CHAPTERS[chapter]!;
  const top = chapter === 0 ? 7125983 : chapter === 6 ? 10205909 : chapter === 1 ? 9549517 : ch.palette.sky!;
  const bottom = chapter === 0 ? 13494749 : chapter === 6 ? 15846320 : chapter === 1 ? 14792340 : ch.palette.fog!;
  return { top: hexLinear(top), bottom: hexLinear(bottom), night: chapter === 0 ? 0.88 : ch.night ? 1 : 0 };
}

export const skySpec = (chapter: number): CustomSpec => {
  const c = skyColors(chapter);
  return {
    glsl: { vertex: SKY_VERTEX, fragment: SKY_FRAGMENT },
    uniforms: {
      skyTop: { type: "color3", value: [...c.top] },
      skyBottom: { type: "color3", value: [...c.bottom] },
      skyNight: { type: "f32", value: c.night }
    },
    side: "back",
    depthWrite: false
  };
};

/** The engine skips a draw whose declared uniform the shader never reads, so each surface declares only what it uses. */
const surfaceUniforms = (chapter: number, names: readonly ("groundColor" | "stoneColor" | "waterColor" | "siltTime")[]): NonNullable<CustomSpec["uniforms"]> => {
  const p = CHAPTERS[chapter]!.palette;
  const all: NonNullable<CustomSpec["uniforms"]> = {
    groundColor: { type: "color3", value: [...hexLinear(p.ground!)] },
    stoneColor: { type: "color3", value: [...hexLinear(p.stone!)] },
    waterColor: { type: "color3", value: [...hexLinear(p.water!)] },
    siltTime: { type: "f32", value: 0 }
  };
  const picked: NonNullable<CustomSpec["uniforms"]> = {
    fogColor: { type: "color3", value: [...hexLinear(p.fog!)] },
    fogFar: { type: "f32", value: 1400 }
  };
  for (const n of names) (picked as Record<string, unknown>)[n] = (all as Record<string, unknown>)[n];
  return picked;
};

export const groundSpec = (chapter: number): CustomSpec => ({
  glsl: { vertex: GROUND_VERTEX, fragment: GROUND_FRAGMENT },
  uniforms: surfaceUniforms(chapter, ["groundColor", "stoneColor"]),
  side: "double"
});

export const waterSpec = (chapter: number): CustomSpec => ({
  glsl: { vertex: GROUND_VERTEX, fragment: WATER_FRAGMENT },
  uniforms: surfaceUniforms(chapter, ["waterColor", "siltTime"]),
  transparent: true,
  depthWrite: false,
  side: "double"
});

export const ringSpec = (active: boolean, color: Rgb = [1, 0.82, 0.42]): CustomSpec => ({
  glsl: { vertex: RING_VERTEX, fragment: RING_FRAGMENT },
  uniforms: {
    ringColor: { type: "color3", value: [...color] },
    ringActive: { type: "f32", value: active ? 1 : 0 },
    siltTime: { type: "f32", value: 0 }
  },
  transparent: true,
  depthWrite: false,
  blending: "additive",
  side: "double"
});

export const bikeSpec = (color: Rgb, glow: Rgb = [0, 0, 0], glowAmount = 0): CustomSpec => ({
  glsl: { vertex: BIKE_VERTEX, fragment: BIKE_FRAGMENT },
  uniforms: { bikeColor: { type: "color3", value: [...color] }, glowColor: { type: "color3", value: [...glow] }, glowAmount: { type: "f32", value: glowAmount } },
  side: "double"
});

/** One of each distinct program the scene uses, so a unit test can compile exactly what the app draws. */
export const allProgramSpecs = (chapter = 0): readonly { readonly name: string; readonly spec: CustomSpec }[] => [
  { name: "sky", spec: skySpec(chapter) },
  { name: "ground", spec: groundSpec(chapter) },
  { name: "water", spec: waterSpec(chapter) },
  { name: "ring", spec: ringSpec(true) },
  { name: "bike", spec: bikeSpec([0.5, 0.5, 0.55], [1, 0.7, 0.3], 0.8) }
];

export const MAX_RINGS = 8;

export interface WorldRuntime {
  update(sim: Sim, dt: number, time: number, aspect: number): void;
  readonly nodeCount: number;
}

export interface World {
  readonly scene: Scene;
  bind(app: AuraApp): WorldRuntime;
}

const FAR = [0, -400, 0] as const;

export function buildWorld(chapter: number): World {
  const ch = CHAPTERS[chapter]!;
  const builder: Scene = scene()
    .background("#12151c")
    .camera(camera.perspective({ position: [0, 14, 60], target: [0, 8, 0], fov: 62, near: 0.3, far: 2700 }));

  builder.add(primitives.sphere({ name: "sky", position: [0, 0, 0], size: 4200, material: material.custom(skySpec(chapter)) }).runtime({ id: "sky" }));
  // The engine plane is already horizontal (XZ, normal +y). A square that follows the rider is enough because the shaders work in world space.
  builder.add(primitives.plane({ name: "ground", position: [0, 0, 0], size: 3200, material: material.custom(groundSpec(chapter)) }).runtime({ id: "ground" }));
  builder.add(primitives.plane({ name: "water", position: [0, 0.35, 0], size: 3200, material: material.custom(waterSpec(chapter)) }).runtime({ id: "water" }));
  for (let i = 0; i < MAX_RINGS; i++) {
    builder.add(primitives.torus({
      name: `ring-${i}`,
      position: [...FAR],
      size: [48, 48, 48],
      params: { tube: 0.035 },
      material: material.custom(ringSpec(i === 0))
    }).runtime({ id: `ring-${i}` }));
  }
  builder.add(primitives.box({ name: "bike-body", position: [0, 4, 0], size: [1.5, 0.9, 3.6], material: material.custom(bikeSpec([0.78, 0.74, 0.7], [0.2, 0.12, 0.05], 0.15)) }).runtime({ id: "bike-body" }));
  builder.add(primitives.cone({ name: "bike-nose", position: [0, 4, -2.6], rotation: [-Math.PI / 2, 0, 0], size: [1.1, 1.6, 1.1], material: material.custom(bikeSpec([0.95, 0.55, 0.28], [1, 0.5, 0.2], 0.5)) }).runtime({ id: "bike-nose" }));
  builder.add(primitives.sphere({ name: "bike-glow", position: [0, 3.4, 1.9], size: 1.1, material: material.custom(bikeSpec([0.4, 0.8, 1], [0.3, 0.8, 1], 1.4)) }).runtime({ id: "bike-glow" }));

  return {
    scene: builder,
    bind(app: AuraApp): WorldRuntime {
      const handles = new Map<string, ReturnType<AuraApp["nodes"]["require"]>>();
      const node = (id: string) => {
        let h = handles.get(id);
        if (!h) handles.set(id, h = app.nodes.require(id));
        return h;
      };
      const cameraController = app.camera;
      if (!cameraController) throw new Error("silt-and-signal-port: the app exposes no camera controller");
      let lookX = 0, lookY = 0, lookZ = 0, init = false;
      return {
        update(sim, dt, time, aspect) {
          const { state, flight } = sim;
          const fx = -Math.sin(state.yaw), fz = -Math.cos(state.yaw);
          const bank = flight.bank;
          const place = (id: string, ox: number, oy: number, oz: number, rx: number, rz: number) => {
            const h = node(id);
            // local offset (ox, oy, oz) rotated by yaw about Y
            const c = Math.cos(state.yaw), s = Math.sin(state.yaw);
            h.setPosition(state.x + ox * c + oz * s, state.y + oy, state.z - ox * s + oz * c);
            h.setRotation(rx, state.yaw, rz);
          };
          place("bike-body", 0, 0, 0, 0, bank);
          place("bike-nose", 0, 0, -2.6, -Math.PI / 2, bank);
          place("bike-glow", 0, -0.6, 1.9, 0, bank);
          node("sky").setPosition(state.x, state.y, state.z);
          node("ground").setPosition(state.x, 0, state.z);
          node("water").setPosition(state.x, 0.35, state.z);
          node("water").setUniform?.("siltTime", time);
          const o = objectiveOf(state);
          for (let i = 0; i < MAX_RINGS; i++) {
            const h = node(`ring-${i}`);
            const p = o.points[i];
            if (!p || state.scene || state.completed) { h.setPosition(...FAR); continue; }
            h.setPosition(p.x, p.y, p.z);
            h.setUniform?.("siltTime", time);
            h.setUniform?.("ringActive", i === state.point ? 1 : 0);
          }
          const back = 13 + Math.min(8, Math.abs(flight.speed) * 0.08);
          const ex = state.x - fx * back, ey = state.y + 5.2 + Math.abs(flight.vertical) * 0.05, ez = state.z - fz * back;
          const tx = state.x + fx * 14, ty = state.y + 1.2, tz = state.z + fz * 14;
          if (!init) { lookX = tx; lookY = ty; lookZ = tz; init = true; }
          const k = 1 - Math.exp(-dt * 5);
          lookX += (tx - lookX) * k; lookY += (ty - lookY) * k; lookZ += (tz - lookZ) * k;
          cameraController.setPose({ position: [ex, ey, ez], target: [lookX, lookY, lookZ], up: [0, 1, 0], fov: aspect < 0.85 ? 78 : 62 }, { cut: false });
        },
        get nodeCount() { return handles.size; }
      };
    }
  };
}
