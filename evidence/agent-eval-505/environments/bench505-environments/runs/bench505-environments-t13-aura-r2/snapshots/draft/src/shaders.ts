import { material } from "@aura3d/engine";

/** Fog colour shared by the look override, the scene background and the reef shader. */
export const FOG_HEX = "#0b5b74";
export const FOG_RGB = "vec3(0.043, 0.357, 0.455)";
export const FOG_NEAR = 3;
export const FOG_FAR = 34;

export type ReefKind = "sand" | "coral" | "weed" | "anemone";

const CONFIG: Record<ReefKind, { sway: number; value: string; ao: string; micro: boolean; edge: boolean }> = {
  sand: { sway: 0, value: "float val = vUv.y;", ao: "1.0", micro: true, edge: true },
  coral: { sway: 0, value: "float val = vUv.y;", ao: "mix(0.5, 1.0, smoothstep(-0.2, 0.9, vW.y))", micro: false, edge: false },
  weed: { sway: 0.38, value: "float val = mix(0.4, 1.0, vUv.y);", ao: "mix(0.55, 1.0, smoothstep(-0.2, 1.2, vW.y))", micro: false, edge: false },
  anemone: { sway: 0.1, value: "float val = mix(0.5, 1.0, vUv.y);", ao: "mix(0.6, 1.0, smoothstep(-0.2, 0.6, vW.y))", micro: false, edge: false }
};

const num = (v: number): string => (Number.isInteger(v) ? `${v}.0` : `${v}`);

const vertexSource = (sway: number): string => /* glsl */ `
out vec3 vW;
out vec3 vN;
out vec2 vUv;
out float vT;
void main() {
  vec3 p = position;
  ${
    sway > 0
      ? `float ph = p.x * 0.9 + p.z * 0.7;
  float s = uv.y * uv.y;
  p.x += (sin(tClock * 1.1 + ph) + 0.5 * sin(tClock * 2.3 + ph * 1.7)) * ${num(sway)} * s;
  p.z += (0.8 * cos(tClock * 0.9 + ph * 1.2) + 0.3 * sin(tClock * 1.9 + ph)) * ${num(sway)} * s;`
      : ""
  }
  vW = p;
  vN = normal;
  vUv = uv;
  vT = tClock;
  gl_Position = modelViewProjectionMatrix * vec4(p, 1.0);
}`;

const fragmentSource = (kind: ReefKind): string => {
  const c = CONFIG[kind];
  return /* glsl */ `
in vec3 vW;
in vec3 vN;
in vec2 vUv;
in float vT;
out vec4 outColor;

float caustic(vec2 uv, float time) {
  vec2 p = mod(uv * 6.28318530718, 6.28318530718) - 250.0;
  vec2 i = p;
  float c = 1.0;
  float inten = 0.005;
  for (int n = 0; n < 5; n++) {
    float t = time * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
    c += 1.0 / max(length(vec2(p.x / (sin(i.x + t) / inten + 0.00001), p.y / (cos(i.y + t) / inten + 0.00001))), 0.0001);
  }
  c /= 5.0;
  c = 1.17 - pow(max(c, 0.0), 1.4);
  return pow(abs(c), 8.0);
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 q = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(q - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  float sat = floor(vUv.x) / 20.0;
  float hue = clamp(fract(vUv.x) / 0.99, 0.0, 1.0);
  ${c.value}
  ${c.micro ? "val += (fract(sin(dot(floor(vW.xz * 45.0), vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.09;" : ""}
  vec3 albedo = hsv2rgb(vec3(hue, sat, val));
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  ${
    c.micro
      ? `float rp = dot(vW.xz, vec2(3.4, 1.5)) + 1.6 * sin(vW.z * 1.3 + vW.x * 0.4);
  N = normalize(N + vec3(0.2 * cos(rp), 0.0, 0.09 * cos(rp)));
  albedo *= 0.93 + 0.07 * sin(rp);`
      : ""
  }
  vec3 L = normalize(vec3(0.28, 1.0, 0.18));
  float ndl = max(dot(N, L), 0.0);
  float depthK = mix(0.5, 1.0, smoothstep(0.0, 9.0, vW.y + 1.0));
  vec3 sunC = vec3(0.72, 1.0, 0.93);
  vec3 amb = mix(vec3(0.05, 0.14, 0.18), vec3(0.14, 0.38, 0.46), 0.5 + 0.5 * N.y);
  float ao = ${c.ao};
  vec3 col = albedo * (amb + sunC * ndl * 1.05 * depthK) * ao;
  float cs = 0.5 * (caustic(vW.xz * 0.16, vT * 0.55) + caustic(vW.xz * 0.23 + 3.7, vT * 0.4 + 5.0));
  float up = smoothstep(-0.1, 0.8, N.y);
  float cAmt = cs * up * exp(-max(vW.y, 0.0) * 0.22) * ${kind === "sand" ? "1.25" : "0.9"};
  col += (albedo * 1.2 + 0.1) * sunC * cAmt * ao;
  col *= vec3(0.8, 1.0, 0.98);
  float d = distance(cameraPosition, vW);
  float f = clamp((d - ${num(FOG_NEAR)}) / ${num(FOG_FAR - FOG_NEAR)}, 0.0, 1.0);
  ${c.edge ? "f = max(f, smoothstep(18.0, 28.0, length(vW.xz)));" : ""}
  col = mix(col, ${FOG_RGB}, f);
  outColor = vec4(col, 1.0);
}`;
};

export const reefMaterial = (kind: ReefKind) =>
  material.custom({
    glsl: { vertex: vertexSource(CONFIG[kind].sway), fragment: fragmentSource(kind) },
    uniforms: { tClock: { type: "f32", value: 0 } },
    side: "double",
    fog: false
  });
