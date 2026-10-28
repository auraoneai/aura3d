import { camera, createAuraApp, effects, material, primitives, scene, texture } from "@aura3d/engine";
import { paintNoise } from "../../shared/noise-canvas";
import type { SceneHandle } from "../../shared/glue";

const WATER_VERTEX = /* glsl */ `
out vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vWorld.y += sin(vWorld.x * 0.7 + waterTime * 1.2) * 0.18 + sin(vWorld.z * 0.9 - waterTime * 0.9) * 0.14;
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}`;

const WATER_FRAGMENT = /* glsl */ `
in vec3 vWorld;
out vec4 outColor;
void main() {
  vec2 uv = vWorld.xz * 0.08;
  vec3 n1 = texture(noiseMap, fract(uv + vec2(waterTime * 0.02, 0.0))).rgb;
  vec3 n2 = texture(noiseMap, fract(uv * 2.3 - vec2(0.0, waterTime * 0.03))).rgb;
  vec3 n = normalize(vec3((n1.r - 0.5) * 0.7, 1.0, (n2.g - 0.5) * 0.7));
  vec3 v = normalize(cameraPosition - vWorld);
  vec3 r = reflect(-v, n);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
  vec3 sky = mix(vec3(0.42, 0.62, 0.78), vec3(0.06, 0.24, 0.52), pow(max(r.y, 0.0), 0.5));
  float sun = pow(max(dot(r, normalize(vec3(0.4, 0.35, -1.0))), 0.0), 220.0);
  vec3 col = mix(vec3(0.02, 0.10, 0.12), sky, 0.25 + 0.75 * fres) + sun * vec3(1.0, 0.85, 0.6) * 2.0;
  outColor = vec4(col, 1.0);
}`;

const SKY_VERTEX = /* glsl */ `
out vec3 vDir;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vDir = world.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const SKY_FRAGMENT = /* glsl */ `
in vec3 vDir;
out vec4 outColor;
void main() {
  vec3 d = normalize(vDir);
  float up = max(d.y, 0.0);
  vec3 c = mix(vec3(0.78, 0.86, 0.92), vec3(0.06, 0.24, 0.52), pow(up, 0.45));
  c += vec3(1.0, 0.8, 0.5) * pow(max(dot(d, normalize(vec3(0.4, 0.35, -1.0))), 0.0), 600.0) * 3.0;
  outColor = vec4(c, 1.0);
}`;

const GRADE_GLSL = /* glsl */ `
uniform float u_vignette;
void main() {
  vec4 c = texture(u_color, v_uv);
  c.rgb *= 1.0 - smoothstep(0.35, 0.85, distance(v_uv, vec2(0.5))) * u_vignette;
  c.rgb = mix(c.rgb, c.rgb * vec3(1.05, 1.0, 0.92), 0.5);
  outColor = c;
}`;

export async function start(canvas: HTMLCanvasElement): Promise<SceneHandle> {
  const noiseMap = texture.canvas({ canvas: paintNoise(), colorSpace: "linear" });
  const app = createAuraApp(canvas, {
    autoStart: false,
    scene: scene()
      .camera(camera.perspective({ fov: 55, far: 1000, position: [0, 2.2, 9], target: [0, 1, -10] }))
      .add(primitives.plane({ size: [80, 1, 80], params: { widthSegments: 96, heightSegments: 96 }, material: material.custom({ glsl: { vertex: WATER_VERTEX, fragment: WATER_FRAGMENT }, uniforms: { waterTime: { type: "f32", value: 0 }, noiseMap: { type: "texture2d", value: noiseMap } } }) }).runtime({ id: "water" }))
      .add(primitives.sphere({ size: 600, params: { widthSegments: 32, heightSegments: 16 }, castShadow: false, material: material.custom({ glsl: { vertex: SKY_VERTEX, fragment: SKY_FRAGMENT }, side: "back", depthWrite: false }) }))
  });
  await app.ready();
  app.post?.addPostPass?.(effects.shaderPass({ name: "grade", order: "before-tonemap", glsl: GRADE_GLSL, uniforms: { u_vignette: 0.6 } }));
  const water = app.nodes.require("water");

  let t = 0;
  return { frame(dt) { t += dt; water.setUniform?.("waterTime", t); app.step(dt); } };
}
