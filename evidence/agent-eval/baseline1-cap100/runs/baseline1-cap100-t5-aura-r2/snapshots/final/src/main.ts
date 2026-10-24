import { createAuraApp, geometry, material, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

/* -------------------------------------------------------------------------- */
/* Shared GLSL: sky model (used by the sky dome AND sampled by the water)     */
/* All colours are authored in sRGB and converted to linear light, because a  */
/* custom shader writes linear light; the output stage tone-maps + encodes.   */
/* -------------------------------------------------------------------------- */
const SKY_GLSL = /* glsl */ `
const vec3 SUN_DIR = vec3(-0.30, 0.17, -0.94);

vec3 toLinear(vec3 c) {
  // cheap sRGB -> linear approximation (no pow)
  return c * (c * (c * 0.305306011 + 0.682171111) + 0.012522878);
}

float hash21(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm3(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2(17.1, 9.2);
    a *= 0.5;
  }
  return s / 0.875;
}

vec3 skyColor(vec3 d) {
  float h = clamp(d.y, 0.0, 1.0);
  vec3 horizon = toLinear(vec3(0.80, 0.87, 0.94));
  vec3 mid     = toLinear(vec3(0.46, 0.67, 0.90));
  vec3 zenith  = toLinear(vec3(0.10, 0.30, 0.68));
  vec3 col = mix(horizon, mid, smoothstep(0.0, 0.25, h));
  col = mix(col, zenith, smoothstep(0.2, 0.9, h));

  // soft procedural clouds projected on a plane above the viewer
  vec2 cp = d.xz / (d.y + 0.18) * 1.4;
  float cl = fbm3(cp + vec2(3.0, 1.0));
  cl = smoothstep(0.52, 0.85, cl) * smoothstep(0.02, 0.28, d.y);
  vec3 cloudCol = mix(toLinear(vec3(0.80, 0.84, 0.90)), vec3(1.05, 1.0, 0.95), 0.5);
  col = mix(col, cloudCol, cl * 0.75);

  // sun: warm glow + bright disc (HDR, tone mapped by the output stage)
  float sd = max(dot(d, normalize(SUN_DIR)), 0.0);
  col += vec3(1.0, 0.72, 0.42) * (pow(sd, 6.0) * 0.18 + pow(sd, 48.0) * 0.35);
  col += vec3(1.0, 0.93, 0.80) * smoothstep(0.99965, 0.99985, sd) * 25.0;
  return col;
}
`;

/* -------------------------------------------------------------------------- */
/* Shared GLSL: wave field (vertex displacement + analytic gradient)          */
/* -------------------------------------------------------------------------- */
const WAVES_GLSL = /* glsl */ `
const vec2 WDIR[5] = vec2[5](
  vec2(0.96, 0.28), vec2(0.62, -0.78), vec2(-0.35, 0.94), vec2(0.20, 0.98), vec2(-0.80, -0.60)
);
const float WK[5] = float[5](0.285, 0.45, 0.785, 1.40, 2.40);
const float WA[5] = float[5](0.50, 0.30, 0.16, 0.075, 0.035);
const float WS[5] = float[5](1.67, 2.10, 2.77, 3.70, 4.85);

void waves(vec2 p, float t, float dist, out float h, out vec2 g) {
  h = 0.0;
  g = vec2(0.0);
  for (int i = 0; i < 5; i++) {
    float k = WK[i];
    float att = exp(-dist * k * 0.0035);
    float ph = dot(WDIR[i], p) * k + t * WS[i];
    float a = WA[i] * att;
    h += a * sin(ph);
    g += WDIR[i] * (a * k * cos(ph));
  }
}
`;

const WATER_VERTEX = /* glsl */ `
out vec3 vWorld;
${WAVES_GLSL}
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float dist = length(wp.xyz - cameraPosition);
  float h;
  vec2 g;
  waves(wp.xz, waveClock, dist, h, g);
  wp.y += h;
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const WATER_FRAGMENT = /* glsl */ `
in vec3 vWorld;
out vec4 outColor;
${SKY_GLSL}
${WAVES_GLSL}

float rippleField(vec2 p, float t) {
  float a = fbm3(p * 0.9 + vec2(t * 0.15, t * 0.10));
  float b = fbm3(p * 2.4 - vec2(t * 0.22, -t * 0.13));
  return a * 0.6 + b * 0.4;
}

void main() {
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / max(dist, 1e-4);

  // macro waves (analytic gradient) + procedural noise ripple detail
  float h;
  vec2 g;
  waves(vWorld.xz, waveClock, dist, h, g);
  vec2 p = vWorld.xz;
  float e = 0.07;
  float r0 = rippleField(p, waveClock);
  float rx = rippleField(p + vec2(e, 0.0), waveClock);
  float rz = rippleField(p + vec2(0.0, e), waveClock);
  vec2 rg = vec2(rx - r0, rz - r0) / e;
  float rAmp = 0.10 * exp(-dist * 0.016);
  vec3 N = normalize(vec3(-(g.x + rg.x * rAmp), 1.0, -(g.y + rg.y * rAmp)));

  // fresnel (Schlick): more sky reflection at grazing angles
  float ndv = max(dot(N, V), 0.0);
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);

  // reflected sky
  vec3 R = reflect(-V, N);
  R.y = abs(R.y);
  vec3 refl = skyColor(normalize(R));

  // water body colour: deep blue-green, brighter on wave crests (scattering)
  vec3 deep    = toLinear(vec3(0.02, 0.12, 0.20));
  vec3 shallow = toLinear(vec3(0.05, 0.40, 0.45));
  float crest = clamp(h * 0.9 + 0.45 + (r0 - 0.5) * 0.4, 0.0, 1.0);
  vec3 body = mix(deep, shallow, crest * crest);

  vec3 col = mix(body, refl, clamp(fres, 0.0, 1.0));

  // sun specular glint (tight lobe + broad sheen), driven by the rippled normal
  vec3 L = normalize(SUN_DIR);
  vec3 H = normalize(L + V);
  float ndh = max(dot(N, H), 0.0);
  float glint = pow(ndh, 1400.0) * 90.0 + pow(ndh, 160.0) * 1.2;
  col += vec3(1.0, 0.90, 0.72) * glint * mix(0.4, 1.0, fres);

  // distance haze towards the horizon colour so the water meets the sky seamlessly
  vec3 hz = skyColor(normalize(vec3(-V.x, 0.015, -V.z)));
  float fog = 1.0 - exp(-dist * 0.0055);
  col = mix(col, hz, clamp(fog, 0.0, 1.0));

  outColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

const SKY_VERTEX = /* glsl */ `
out vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const SKY_FRAGMENT = /* glsl */ `
in vec3 vWorld;
out vec4 outColor;
${SKY_GLSL}
void main() {
  vec3 d = normalize(vWorld - cameraPosition);
  outColor = vec4(max(skyColor(d), vec3(0.0)), 1.0);
}
`;

/* -------------------------------------------------------------------------- */
/* Geometry                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Subdivided water grid. Rows are spaced non-uniformly (dense near the camera,
 * sparse towards the horizon) so the waves are real geometry where it matters.
 */
function buildWaterGrid(cols: number, rows: number, farDistance: number) {
  const positions = new Float32Array((cols + 1) * (rows + 1) * 3);
  const normals = new Float32Array((cols + 1) * (rows + 1) * 3);
  let o = 0;
  for (let r = 0; r <= rows; r++) {
    const v = r / rows;
    const d = Math.pow(v, 2.2) * farDistance;
    const z = 16 - d;
    const halfWidth = 14 + d * 1.6;
    for (let c = 0; c <= cols; c++) {
      const u = c / cols;
      positions[o] = (u * 2 - 1) * halfWidth;
      positions[o + 1] = 0;
      positions[o + 2] = z;
      normals[o + 1] = 1;
      o += 3;
    }
  }
  const indices = new Uint32Array(cols * rows * 6);
  let k = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = r * (cols + 1) + c;
      const b = a + 1;
      const cc = a + cols + 1;
      const dd = cc + 1;
      indices[k++] = a;
      indices[k++] = cc;
      indices[k++] = b;
      indices[k++] = b;
      indices[k++] = cc;
      indices[k++] = dd;
    }
  }
  return geometry.define({ positions, normals, indices });
}

function buildSkyDome(radius: number, segU: number, segV: number) {
  const positions = new Float32Array((segU + 1) * (segV + 1) * 3);
  const normals = new Float32Array((segU + 1) * (segV + 1) * 3);
  let o = 0;
  for (let j = 0; j <= segV; j++) {
    const phi = (j / segV) * Math.PI;
    for (let i = 0; i <= segU; i++) {
      const theta = (i / segU) * Math.PI * 2;
      const x = Math.sin(phi) * Math.cos(theta);
      const y = Math.cos(phi);
      const z = Math.sin(phi) * Math.sin(theta);
      positions[o] = x * radius;
      positions[o + 1] = y * radius;
      positions[o + 2] = z * radius;
      normals[o] = -x;
      normals[o + 1] = -y;
      normals[o + 2] = -z;
      o += 3;
    }
  }
  const indices = new Uint32Array(segU * segV * 6);
  let k = 0;
  for (let j = 0; j < segV; j++) {
    for (let i = 0; i < segU; i++) {
      const a = j * (segU + 1) + i;
      const b = a + 1;
      const c = a + segU + 1;
      const d = c + 1;
      indices[k++] = a;
      indices[k++] = c;
      indices[k++] = b;
      indices[k++] = b;
      indices[k++] = c;
      indices[k++] = d;
    }
  }
  return geometry.define({ positions, normals, indices });
}

/* -------------------------------------------------------------------------- */
/* Scene                                                                      */
/* -------------------------------------------------------------------------- */

const waterMaterial = material.custom({
  glsl: { vertex: WATER_VERTEX, fragment: WATER_FRAGMENT },
  uniforms: { waveClock: { type: "f32", value: 0 } },
  side: "double"
});

const skyMaterial = material.custom({
  glsl: { vertex: SKY_VERTEX, fragment: SKY_FRAGMENT },
  side: "double"
});

const world = scene()
  .background("#cfdcec")
  .camera({
    mode: "perspective",
    position: [0, 2.0, 10],
    target: [0, -3.4, -40],
    fov: 50,
    near: 0.1,
    far: 2000
  })
  .add(
    geometry
      .custom(buildSkyDome(900, 48, 32), { name: "sky-dome", material: skyMaterial })
      .runtime({ id: "sky" })
  )
  .add(
    geometry
      .custom(buildWaterGrid(220, 260, 560), { name: "water", material: waterMaterial })
      .runtime({ id: "water", mutable: true })
  );

const app = createAuraApp("#app", {
  scene: world,
  resize: false,
  pixelRatio: 1,
  // Custom shaders write linear light; "neutral" tone mapping keeps authored
  // hues intact and rolls the HDR sun glint off smoothly.
  output: { toneMapping: "neutral", exposure: 1.0 }
});

const startTime = performance.now();
let readyFlagged = false;

app.onFrame(() => {
  const t = (performance.now() - startTime) / 1000;
  try {
    app.nodes.require("water").setUniform?.("waveClock", t);
  } catch {
    // runtime node not mounted yet; the next frame will retry
  }
  if (!readyFlagged) {
    readyFlagged = true;
    // flag after the renderer has presented this first frame
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.__EVAL_READY__ = true;
      });
    });
  }
});

void app.ready();
