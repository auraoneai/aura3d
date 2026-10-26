import { camera, createAuraApp, effects, environments, lights, material, model, primitives, scene } from "@aura3d/engine";
import { assets } from "../../src/aura-assets";

/**
 * Minimal repro for the "turning the sun shadow on darkens the whole frame" report (Shadowstep Gauntlet). Every
 * variant renders the same receiver plane; the only difference between `<x>-off` and `<x>-on` is the sun's `shadow`
 * option, and no caster ever sits over the plane, so any luma change is the shadow lookup itself.
 */
interface Variant {
  readonly id: string;
  readonly sun: boolean;
  readonly env?: boolean;
  readonly fill?: boolean;
  readonly rim?: "default" | "off";
  readonly look?: boolean;
  readonly far?: boolean;
  readonly custom?: boolean;
  readonly caster?: "side" | "over";
}

const base: Omit<Variant, "id" | "sun">[] = [
  { caster: "side" },
  { env: true, fill: true, caster: "side" },
  { env: true, fill: true, rim: "default", caster: "side" },
  { env: true, fill: true, rim: "default", look: true, far: true, caster: "side" },
  { env: true, fill: true, rim: "off", look: true, far: true, caster: "side" }
];
const names = ["A", "B", "C", "D", "E"];
const VARIANTS: Variant[] = base.flatMap((b, i) => [
  { id: `${names[i]}-off`, sun: false, ...b },
  { id: `${names[i]}-on`, sun: true, ...b }
]);
VARIANTS.push(
  { id: "G-pbr-over-off", sun: false, caster: "over" }, { id: "G-pbr-over-on", sun: true, caster: "over" },
  { id: "H-custom-over-off", sun: false, caster: "over", custom: true }, { id: "H-custom-over-on", sun: true, caster: "over", custom: true }
);

declare global {
  interface Window {
    __REPRO__?: { ids: string[]; render(id: string): Promise<unknown> };
    __REPRO_ERROR__?: string;
    __REPRO_APP__?: { dispose(): void };
  }
}

const CUSTOM_PLANE = {
  receiveShadow: true,
  glsl: {
    vertex: "out vec3 vWorld; out vec3 vN; void main(){ vWorld=(modelMatrix*vec4(position,1.0)).xyz; vN=normalize(normalMatrix*normal); gl_Position=modelViewProjectionMatrix*vec4(position,1.0); }",
    fragment: "in vec3 vWorld; in vec3 vN; out vec4 outColor; void main(){ vec3 N=normalize(vN); float d=max(dot(N, normalize(vec3(2.6,4.4,2.2))),0.0); float sh=a3dSunShadowAuto(vWorld, N); outColor=vec4(vec3(0.78,0.8,0.82)*(0.25+0.75*d*sh),1.0); }"
  }
};

function build(v: Variant) {
  const b = scene().background("#8fb7c9").camera(camera.perspective(v.far
    ? { position: [0, 6, 12], target: [0, 2, -20], fov: 57, near: 0.1, far: 3200 }
    : { position: [0, 2.9, 4.6], target: [0, 0.55, 0], fov: 40 }));
  if (v.env) b.add(environments.hdri({ name: "ibl", intensity: 0.7, background: false, texture: { type: "texture", format: "hdr", url: "/hdri/autumn_field_puresky_1k.hdr" } as never }));
  b.add(lights.directional({ name: "sun", position: [2.6, 4.4, 2.2], target: [0, 0, 0], intensity: v.env ? 2.8 : 2.1, color: "#ffe3b1", shadow: v.sun ? { cascades: 2 } as never : false }));
  if (v.fill) b.add(lights.hemisphere({ name: "fill", skyColor: "#d3ebf3", groundColor: "#80715b", intensity: 0.5 }));
  if (v.rim === "default") b.add(lights.directional({ name: "rim", position: [-3, 2, -4], intensity: 0.4, color: "#bcd9ff" }));
  if (v.rim === "off") b.add(lights.directional({ name: "rim", position: [-3, 2, -4], intensity: 0.4, color: "#bcd9ff", shadow: false }));
  if (v.look) {
    b.add(effects.fog({ name: "haze", color: "#b5c8c4", density: 0.0028 }));
    b.add(effects.ambientOcclusion({ name: "ao" }));
    b.add(effects.bloom({ name: "bloom", intensity: 0.35, threshold: 1.0, radius: 0.4 }));
    b.add(effects.vignette({ name: "vignette", intensity: 0.22, smoothness: 0.7 }));
  }
  const plane = primitives.plane({ name: "receiver", material: v.custom ? material.custom(CUSTOM_PLANE as never) : material.pbr({ color: "#c8ccd2", roughness: 0.85, metallic: 0 }), receiveShadow: true } as never);
  b.add(plane.position(0, 0, 0).scale(v.far ? [3000, 1, 3000] : [10, 1, 10]));
  if (v.caster) b.add(primitives.box({ name: "caster", size: [1.2, 1.2, 1.2], material: material.pbr({ color: "#8a5a35", roughness: 0.8 }), castShadow: true }).position(...(v.caster === "over" ? [0, 1.4, 0] : [6, 0.6, -2]) as [number, number, number]));
  b.add(model(assets.robotcand, { name: "typed", targetMaxDimension: 2.4 }).position(42, 1.2, 42).runtime({ id: "typed" }));
  return b;
}

async function renderVariant(id: string) {
  const v = VARIANTS.find((x) => x.id === id);
  if (!v) throw new Error(`unknown variant ${id}`);
  const stage = document.getElementById("stage")!;
  window.__REPRO_APP__?.dispose();
  stage.replaceChildren();
  const app = createAuraApp(stage, { pixelRatio: 1, resize: false, renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" }, scene: build(v) });
  const t0 = performance.now();
  while (!(app.diagnostics().drawCalls > 0) && performance.now() - t0 < 30000) await new Promise((r) => setTimeout(r, 50));
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  app.step(1 / 60);
  await new Promise((r) => requestAnimationFrame(r));
  await new Promise((r) => setTimeout(r, 400));
  const d = app.diagnostics();
  const out = { id, drawCalls: d.drawCalls, runtime: d.renderer?.runtime.backend, shadows: d.renderer?.shadows };
  window.__REPRO_APP__ = app;
  return out;
}

window.__REPRO__ = { ids: VARIANTS.map((v) => v.id), render: renderVariant };
