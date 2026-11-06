import { camera, createAuraApp, geometry, material, scene, sky } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

// Sun direction (same convention as the sky: elevation/azimuth, -z is forward).
const SUN_ELEV = 12;
const SUN_AZ = 15;
const E = (SUN_ELEV * Math.PI) / 180;
const A = (SUN_AZ * Math.PI) / 180;
const sunDir: [number, number, number] = [Math.sin(A) * Math.cos(E), Math.sin(E), -Math.cos(A) * Math.cos(E)];
const f3 = (n: number): string => n.toFixed(5);
const SUN = `vec3(${f3(sunDir[0])}, ${f3(sunDir[1])}, ${f3(sunDir[2])})`;

const N = 220;
const SIZE = 400;
const positions = new Float32Array((N + 1) ** 2 * 3);
const normals = new Float32Array(positions.length);
const indices: number[] = [];
for (let j = 0; j <= N; j += 1) {
  for (let i = 0; i <= N; i += 1) {
    const v = j * (N + 1) + i;
    positions.set([(i / N - 0.5) * SIZE, 0, (j / N - 0.5) * SIZE], v * 3);
    normals[v * 3 + 1] = 1;
    if (i < N && j < N) indices.push(v, v + N + 1, v + 1, v + 1, v + N + 1, v + N + 2);
  }
}

const waveFn = `
vec3 waveAt(vec2 p, float t, out vec3 nrm) {
  float h = 0.0;
  vec2 g = vec2(0.0);
  // direction, wavenumber, amplitude, speed
  vec4 w0 = vec4(0.80, 0.60, 0.16, 0.55);
  vec4 w1 = vec4(-0.50, 0.87, 0.25, 0.70);
  vec4 w2 = vec4(0.20, -0.98, 0.45, 0.90);
  vec4 w3 = vec4(0.95, 0.31, 0.90, 1.20);
  float amp0 = 0.90, amp1 = 0.55, amp2 = 0.30, amp3 = 0.12;
  for (int i = 0; i < 4; i++) {
    vec4 w = i == 0 ? w0 : (i == 1 ? w1 : (i == 2 ? w2 : w3));
    float amp = i == 0 ? amp0 : (i == 1 ? amp1 : (i == 2 ? amp2 : amp3));
    vec2 d = normalize(w.xy);
    float k = w.z * 1.0;
    float ph = dot(d, p) * k + t * w.w * 1.2;
    h += sin(ph) * amp;
    g += d * cos(ph) * amp * k;
  }
  nrm = normalize(vec3(-g.x, 1.0, -g.y));
  return vec3(p.x, h, p.y);
}`;

const water = material.custom({
  glsl: {
    vertex: `out vec3 vPos; out vec3 vN;
${waveFn}
void main() {
  vec3 n;
  vec3 p = waveAt(position.xz, uTime, n);
  vPos = p;
  vN = n;
  gl_Position = modelViewProjectionMatrix * vec4(p, 1.0);
}`,
    fragment: `in vec3 vPos; in vec3 vN; out vec4 outColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; }
  return s;
}
vec3 skyColor(vec3 d) {
  float y = clamp(d.y, 0.0, 1.0);
  vec3 c = mix(vec3(0.80, 0.62, 0.50) * 1.0, vec3(0.05, 0.20, 0.55), pow(y, 0.45));
  c = mix(vec3(0.85, 0.80, 0.78), c, smoothstep(0.0, 0.12, y));
  float cd = max(dot(d, ${SUN}), 0.0);
  c += vec3(1.0, 0.7, 0.4) * pow(cd, 64.0) * 0.5;
  return c;
}
void main() {
  vec3 v = normalize(cameraPosition - vPos);
  float dist = length(cameraPosition - vPos);
  vec2 q = vPos.xz;
  // procedural ripple detail (fades with distance to avoid shimmer)
  float fade = 1.0 / (1.0 + dist * 0.025);
  vec2 r1 = vec2(fbm(q * 1.6 + vec2(uTime * 0.35, uTime * 0.2)), fbm(q * 1.6 + 7.3 - vec2(uTime * 0.25, uTime * 0.3)));
  vec2 r = (r1 - 0.5) * 0.7 * fade;
  vec3 n = normalize(vN + vec3(r.x, 0.0, r.y));
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  vec3 refl = reflect(-v, n);
  refl.y = abs(refl.y);
  vec3 sky = skyColor(refl);
  // body colour, lighter on wave crests
  float crest = clamp(vPos.y * 0.25 + 0.5, 0.0, 1.0);
  vec3 body = mix(vec3(0.005, 0.07, 0.12), vec3(0.03, 0.30, 0.34), crest * 0.7);
  vec3 col = mix(body, sky, clamp(fres, 0.0, 1.0));
  // sun glint
  vec3 L = ${SUN};
  vec3 h = normalize(L + v);
  float spec = pow(max(dot(n, h), 0.0), 220.0);
  float spec2 = pow(max(dot(n, h), 0.0), 40.0) * 0.15;
  col += vec3(1.0, 0.85, 0.6) * (spec * 3.0 + spec2);
  // fade to horizon haze
  float haze = smoothstep(80.0, 330.0, dist);
  col = mix(col, vec3(0.85, 0.80, 0.78), haze * 0.9);
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: {}
});

const sc = scene({ background: "#c8cdd6" })
  .camera(camera.perspective({ position: [0, 5, 28], target: [0, 1.5, -60], fov: 55, near: 0.5, far: 700 }))
  .add(sky.gradient({ zenith: "#2a62c0", horizon: "#e4d8cf", sun: { elevationDeg: SUN_ELEV, azimuthDeg: SUN_AZ, intensity: 1 } }))
  .add(
    geometry.custom(
      geometry.define({ positions, normals, indices, bounds: { min: [-SIZE / 2, -3, -SIZE / 2], max: [SIZE / 2, 3, SIZE / 2] } }),
      { name: "water", material: water, castShadow: false }
    )
  );

const app = createAuraApp("#app", { scene: sc });
await app.ready();
window.__EVAL_READY__ = true;
