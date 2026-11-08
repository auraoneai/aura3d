/**
 * A3/W6 proof page: the hand-written WGSL twins of Roadster Rush's custom shaders (sky, haze floor, glass towers, road decals,
 * wakes, plumes, shield) and Cumulus Dash's sky dome and valley, mounted through `createAuraApp` with no post chain, so the
 * WebGPU pre-check has no depth gap and `?backend=webgpu` really draws on WebGPU. Compare against the default (WebGL2):
 * the GLSL is the same program the games draw, so the two frames should match in static regions.
 *
 *   ?scene=roadster (default) | cumulus | cumulus-original     ?backend=webgpu|auto     ?glslonly=1 (drop the twins: fallback)
 */
import { camera, createAuraApp, instances, lights, material, primitives, scene } from "@aura3d/engine";
import { labAppOptions, readLabFlags } from "../shared/lab-flags";
import { skySpec as roadsterSky } from "../../apps/showcase-roadster-rush/src/art/sky";
import { groundSpec, HAZE_FLOOR_Y } from "../../apps/showcase-roadster-rush/src/art/ground";
import { shieldSpec, SHIELD_SIZE } from "../../apps/showcase-roadster-rush/src/art/shield";
import { APEX_PLUMES, plumeSpec } from "../../apps/showcase-roadster-rush/src/art/plume";
import { TOWER_VARIANTS, towerGlassSpec, towerLayout } from "../../apps/showcase-roadster-rush/src/render/towers";
import { DECAL_KIND_CODE, DECAL_SIZE, DECAL_Y, decalLayout, decalSpec } from "../../apps/showcase-roadster-rush/src/render/decals";
import { wakeSpec } from "../../apps/showcase-roadster-rush/src/render/wakes";
import { skySpec as cumulusSky, valleySpec } from "../kid-goku-beyond-the-clouds-port/materials";
import { lookRow } from "../kid-goku-beyond-the-clouds-port/art/look";

type Spec = Parameters<typeof material.custom>[0];
const params = new URLSearchParams(location.search);
const glslOnly = params.get("glslonly") === "1";
const custom = (spec: Spec) => material.custom(glslOnly ? { ...spec, wgsl: undefined } : spec);
const which = params.get("scene") ?? "roadster";

function roadsterScene() {
  const s = scene()
    .background("#140b1c")
    .camera(camera.perspective({ fov: 55, near: 0.25, far: 550, position: [0, 3.6, 5.2], target: [0, 0.6, -6.0] }))
    .add(lights.hemisphere({ sky: "#7c8cff", ground: "#2a1630", intensity: 0.8 }))
    .add(lights.directional({ direction: [-0.087, -0.122, 0.989], color: "#ffb47a", intensity: 2.2 }))
    .add(primitives.sphere({ name: "sky", size: [760, 760, 760], material: custom(roadsterSky()), castShadow: false, receiveShadow: false }))
    .add(primitives.box({ name: "ground", size: [1400, 0.12, 900], material: custom(groundSpec()), castShadow: false, receiveShadow: false })
      .position(0, HAZE_FLOOR_Y, -300))
    .add(primitives.box({ name: "deck", size: [22, 0.2, 600], material: material.pbr({ color: "#2b2a33", roughness: 0.8 }), castShadow: false })
      .position(0, -0.1, -250));
  const towers = towerLayout(0);
  for (const variant of TOWER_VARIANTS) {
    const transforms = towers.filter((t) => t.variant === variant)
      .map((t) => ({ position: [t.x, t.y, t.z] as [number, number, number], rotation: [0, t.yaw, 0] as [number, number, number], scale: [t.width, t.height, t.depth] as [number, number, number] }));
    if (transforms.length) s.add(instances.box({ name: `tower-${variant}`, size: [1, 1, 1], material: custom(towerGlassSpec(variant)), castShadow: false, receiveShadow: false, transforms }));
  }
  const decals = decalLayout(0).filter((d) => d.z < 2 && d.z > -60).map((d) => {
    const [w, l] = DECAL_SIZE[d.kind];
    return { position: [d.x, DECAL_Y, d.z] as [number, number, number], rotation: [0, d.yaw, 0] as [number, number, number], scale: [w, DECAL_KIND_CODE[d.kind], l] as [number, number, number] };
  });
  decals.push({ position: [0, DECAL_Y, -2], rotation: [0, 0, 0], scale: [2.7, 4.45, 5.4] });
  s.add(instances.plane({ name: "decals", material: custom(decalSpec()), castShadow: false, receiveShadow: false, transforms: decals }));
  // two wake strips (instance y scale = strength, x = width, z axis = length) and a plain + an instanced plume
  s.add(instances.plane({ name: "wakes", material: custom(wakeSpec("#4df0ff", 0.2, [40, 90])), castShadow: false, receiveShadow: false,
    transforms: [-0.42, 0.42].map((x) => ({ position: [x, 0.46, -1.0] as [number, number, number], scale: [0.34, 1, 5] as [number, number, number] })) }));
  s.add(primitives.cylinder({ name: "plume-plain", size: [0.42, 1.65, 0.42], material: custom(plumeSpec(APEX_PLUMES.rear, true)), castShadow: false })
    .position(-1.6, 0.9, -3).rotation(Math.PI / 2, 0, 0));
  s.add(instances.cylinder({ name: "plume-instanced", size: [0.42, 1.65, 0.42], material: custom(plumeSpec(APEX_PLUMES.sky, true, true)), castShadow: false,
    transforms: [1.6, 3.2].map((x) => ({ position: [x, 0.9, -3] as [number, number, number], rotation: [Math.PI / 2, 0, 0] as [number, number, number] })) }));
  s.add(primitives.sphere({ name: "shield", size: SHIELD_SIZE, material: custom(shieldSpec()), castShadow: false }).position(0, 0.8, -6));
  return s;
}

function cumulusScene(original: boolean) {
  const row = lookRow(original ? "original" : "storm-washed");
  return scene()
    .background("#9cc4e8")
    .camera(camera.perspective({ fov: 60, near: 0.5, far: 4000, position: [0, 40, 0], target: [0, 46, -100] }))
    .add(primitives.sphere({ name: "sky", size: 3600, castShadow: false, material: custom(cumulusSky(row)) }))
    .add(primitives.box({ name: "valley", size: [4000, 1, 4000], castShadow: false, material: custom(valleySpec(row)) }).position(0, -120, 0));
}

const canvas = document.querySelector<HTMLCanvasElement>("#stage")!;
const status = document.querySelector<HTMLDivElement>("#status")!;
const lab = labAppOptions(readLabFlags());
const app = createAuraApp(canvas, {
  scene: which === "roadster" ? roadsterScene() : cumulusScene(which === "cumulus-original"),
  ...(lab.renderer ? { renderer: lab.renderer } : {})
});
void app.ready().then(() => {
  const selection = (app.diagnostics() as { backendSelection?: unknown }).backendSelection;
  status.textContent = `ready ${which}${glslOnly ? " glsl-only" : ""} ${JSON.stringify(selection ?? {})}`;
  console.info(`[wgsl-twins-lab] backendSelection ${JSON.stringify(selection ?? {})}`);
  document.body.dataset.aura3dReady = "1";
}, (error: unknown) => { status.textContent = `error ${String(error)}`; });
