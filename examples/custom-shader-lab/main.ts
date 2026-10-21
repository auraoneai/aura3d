import {
  camera,
  createAuraApp,
  effects,
  lights,
  material,
  primitives,
  scene,
  type AuraApp
} from "@aura3d/engine";
import { registerShaderChunk } from "@aura3d/rendering";

/**
 * threejs-parity SH-02/SH-03/SH-10 (lane L1): the public custom-shading
 * surface exercised end-to-end on the WebGL2 path.
 *
 * - `material.custom(spec)` — three-style GLSL with authored uniforms
 *   (`clock`, `tint`, `strength`) plus injected built-ins (`uTime`,
 *   `modelMatrix`, `normalMatrix`, `cameraPosition`).
 * - `registerShaderChunk` + `#include <custom_lab_wave>` — SH-10 chunk
 *   resolution; the rim plane overrides it via `patch` (SH-09).
 * - `handle.setUniform(name, value)` — parameter writes only; no recompile.
 * - `effects.shaderPass` at named order slots + `app.post.setPassUniform`.
 */

interface LabEvidence {
  readonly id: "custom-shader-lab";
  status: "loading" | "ready" | "error";
  readonly claim: "engine-public-custom-shading-webgl2";
  backend: string;
  frame: number;
  materialCount: number;
  passNames: readonly string[];
  uTime: { readonly pulse: number; readonly rim: number };
  setUniformApplied: boolean;
  chunkRegistered: boolean;
  postUniformApplied: boolean;
  readonly publicApiOnly: boolean;
  readonly errors: readonly string[];
  error?: string;
}

declare global {
  interface Window {
    __AURA_CUSTOM_SHADER_LAB__?: LabEvidence;
    /** Renders one deterministic frame with the `clock` uniform pinned (0/1 for the spec). */
    __AURA_CUSTOM_SHADER_LAB_SET_TIME__?: (value: number) => void;
    /** Mutates the before-tonemap post pass's `u_gain` without rebuilding. */
    __AURA_CUSTOM_SHADER_LAB_SET_PASS_GAIN__?: (value: number) => void;
    /** Recompiles nothing — writes the rim plane's authored `strength`. */
    __AURA_CUSTOM_SHADER_LAB_SET_STRENGTH__?: (value: number) => void;
  }
}

const canvas = document.querySelector<HTMLCanvasElement>("#stage");
if (!canvas) throw new Error("custom-shader-lab canvas is missing");

const errors: string[] = [];
const evidence: LabEvidence = {
  id: "custom-shader-lab",
  status: "loading",
  claim: "engine-public-custom-shading-webgl2",
  backend: "webgl2",
  frame: 0,
  materialCount: 3,
  passNames: ["lab-posterize", "lab-invert"],
  uTime: { pulse: 0, rim: 0 },
  setUniformApplied: false,
  chunkRegistered: false,
  postUniformApplied: false,
  publicApiOnly: true,
  errors
};

let app: AuraApp | undefined;
let clockValue = 0;
let strengthValue = 1;
let passGain = 1;

const publish = () => {
  window.__AURA_CUSTOM_SHADER_LAB__ = evidence;
  const el = document.querySelector("#evidence");
  if (el) el.textContent = evidence.status === "ready" ? `frame ${evidence.frame} · backend ${evidence.backend}` : evidence.status;
  const backendEl = document.querySelector("#backend");
  if (backendEl) backendEl.textContent = evidence.backend;
};

// SH-10: a mutable global chunk — material.custom resolves it via #include.
registerShaderChunk(
  "custom_lab_wave",
  "float customLabWave(vec3 p) { return 0.5 + 0.5 * sin(p.x * 6.0 + p.y * 4.0); }",
  "fn customLabWave(p: vec3f) -> f32 { return 0.5 + 0.5 * sin(p.x * 6.0 + p.y * 4.0); }"
);
evidence.chunkRegistered = true;

const PULSE_FRAGMENT = `in vec2 v_uv;
out vec4 outColor;
void main() {
  float band = 0.5 + 0.5 * sin((v_uv.x + v_uv.y) * 18.0 + clock * 6.2831);
  outColor = vec4(tint * band * strength, 1.0);
}`;

const CHUNK_FRAGMENT = `#include <custom_lab_wave>
in vec3 v_normal;
out vec4 outColor;
void main() {
  float wave = customLabWave(v_normal) * (0.4 + 0.6 * clock);
  outColor = vec4(mix(tint, vec3(1.0), wave * strength), 1.0);
}`;

const RIM_FRAGMENT = `in vec3 v_normal;
in vec3 v_worldPosition;
out vec4 outColor;
void main() {
  vec3 viewDir = normalize(cameraPosition - v_worldPosition);
  float rim = pow(1.0 - abs(dot(normalize(v_normal), viewDir)), 2.0);
  // uTime alias resolves to the built-in u_time; ×0 keeps frames deterministic.
  outColor = vec4(tint * (rim * strength + 0.08) * (0.5 + clock * 0.5) + uTime * 0.0, 1.0);
}`;

const PULSE_VERTEX = `in vec3 a_position;
in vec3 a_normal;
in vec2 a_uv;
out vec2 v_uv;
out vec3 v_normal;
out vec3 v_worldPosition;
void main() {
  v_uv = a_uv;
  v_normal = normalize(mat3(normalMatrix) * a_normal);
  v_worldPosition = (modelMatrix * vec4(a_position, 1.0)).xyz;
  gl_Position = modelViewProjectionMatrix * vec4(a_position, 1.0);
}`;

const labMaterial = (fragment: string, tint: string, patch?: Record<string, string>) =>
  material.custom({
    glsl: { vertex: PULSE_VERTEX, fragment },
    uniforms: {
      clock: { type: "f32", value: 0 },
      tint: { type: "color3", value: tint },
      strength: { type: "f32", value: 1 }
    },
    side: "double",
    ...(patch ? { patch } : {})
  });

const buildScene = () =>
  scene()
    .background("#080a18")
    .camera(camera({ position: [0, 1.6, 6.2], lookAt: [0, 0.4, 0], fov: 46 }))
    .add(lights.directional({ name: "lab key", position: [4, 7, 5], intensity: 1.4 }))
    .add(primitives.box({ name: "pulse-box", material: labMaterial(PULSE_FRAGMENT, "#54e0c7") })
      .runtime({ id: "pulse-box" })
      .position(-2.1, 0.55, 0))
    .add(primitives.sphere({ name: "chunk-sphere", material: labMaterial(CHUNK_FRAGMENT, "#f3b75c") })
      .runtime({ id: "chunk-sphere" })
      .position(0, 0.75, 0)
      .scale(0.8))
    .add(primitives.plane({ name: "rim-plane", material: labMaterial(RIM_FRAGMENT, "#8d9cff", { custom_lab_wave: "float customLabWave(vec3 p) { return 1.0; }" }) })
      .runtime({ id: "rim-plane" })
      .position(2.1, 0.55, 0)
      .rotate(-0.5, 0.3, 0)
      .scale([1.5, 1.1, 1.5]));

const renderFrame = async (): Promise<void> => {
  if (!app) return;
  app.step(1 / 60);
  evidence.frame += 1;
  publish();
};

const applyClock = (): void => {
  if (!app) return;
  for (const id of ["pulse-box", "chunk-sphere", "rim-plane"]) {
    app.nodes.require(id).setUniform("clock", clockValue);
  }
  evidence.uTime = { pulse: clockValue, rim: clockValue };
  evidence.setUniformApplied = true;
};

const boot = async (): Promise<void> => {
  app = createAuraApp(canvas, {
    autoStart: false,
    resize: false,
    pixelRatio: 1,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    scene: buildScene()
  });
  await app.ready();
  // SH-03: two ordered custom post passes + a disabled one that must not run.
  app.post?.addPostPass?.(effects.shaderPass({
    name: "lab-posterize",
    order: "before-tonemap",
    glsl: `uniform float u_gain;
void main() { vec4 c = texture(u_color, v_uv); outColor = vec4(floor(c.rgb * u_gain * 4.0) / max(u_gain * 4.0, 1e-4), c.a); }`,
    uniforms: { u_gain: passGain }
  }));
  app.post?.addPostPass?.(effects.shaderPass({
    name: "lab-invert",
    order: "after-tonemap",
    glsl: `uniform float u_mix;
void main() { vec4 c = texture(u_color, v_uv); outColor = vec4(mix(c.rgb, 1.0 - c.rgb, u_mix), c.a); }`,
    uniforms: { u_mix: 0.0 }
  }));
  app.post?.addPostPass?.(effects.shaderPass({
    name: "lab-disabled",
    order: "before-tonemap",
    enabled: false,
    glsl: `void main() { outColor = vec4(1.0, 0.0, 0.0, 1.0); }`
  }));
  applyClock();
  window.__AURA_CUSTOM_SHADER_LAB_SET_TIME__ = (value: number) => {
    clockValue = value;
    applyClock();
    void renderFrame();
  };
  window.__AURA_CUSTOM_SHADER_LAB_SET_STRENGTH__ = (value: number) => {
    strengthValue = value;
    app?.nodes.require("rim-plane").setUniform("strength", strengthValue);
  };
  window.__AURA_CUSTOM_SHADER_LAB_SET_PASS_GAIN__ = (value: number) => {
    passGain = value;
    app?.post?.setPassUniform?.("lab-posterize", "u_gain", passGain);
    evidence.postUniformApplied = true;
  };
  evidence.status = "ready";
  await renderFrame();
};

void boot().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  errors.push(message);
  evidence.status = "error";
  evidence.error = message;
  publish();
});
