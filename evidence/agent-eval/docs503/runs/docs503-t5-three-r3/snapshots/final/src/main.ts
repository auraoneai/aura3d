import * as THREE from 'three';

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const canvas = document.getElementById('app') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(640, 360, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 640 / 360, 0.1, 2000);
camera.position.set(0, 2.6, 0);
camera.lookAt(0, 1.9, -50);

const sunDir = new THREE.Vector3(-0.25, 0.16, -1).normalize();

// Shared sky function (linear colours, HDR). Used by the dome and by the water reflection.
const skyGLSL = /* glsl */ `
uniform vec3 uSunDir;
vec3 horizonColor() { return vec3(0.62, 0.74, 0.88); }
vec3 skyColor(vec3 dir) {
  float h = max(dir.y, 0.0);
  vec3 zenith = vec3(0.07, 0.22, 0.58);
  vec3 horizon = horizonColor();
  vec3 col = mix(horizon, zenith, pow(h, 0.45));
  float s = max(dot(dir, uSunDir), 0.0);
  col += vec3(1.0, 0.75, 0.45) * pow(s, 8.0) * 0.35;   // glow
  col += vec3(1.0, 0.85, 0.6) * pow(s, 400.0) * 6.0;    // disc
  return col;
}
`;

const sunUniform = { value: sunDir };

// Sky dome
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  uniforms: { uSunDir: sunUniform },
  vertexShader: /* glsl */ `
    varying vec3 vDir;
    void main() {
      vDir = position;
      vec4 p = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * p;
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec3 vDir;
    ${skyGLSL}
    void main() {
      gl_FragColor = vec4(skyColor(normalize(vDir)), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), skyMat);
sky.frustumCulled = false;
sky.renderOrder = -1;
scene.add(sky);

// Water
const waveGLSL = /* glsl */ `
uniform float uTime;
const int NW = 5;
// direction xy, wavenumber, amplitude
const vec4 W[5] = vec4[5](
  vec4( 0.00, -1.00, 0.30, 0.34),
  vec4( 0.55, -0.83, 0.55, 0.18),
  vec4(-0.70, -0.71, 0.90, 0.09),
  vec4( 0.90, -0.43, 1.50, 0.045),
  vec4(-0.30, -0.95, 2.30, 0.022)
);
// returns height in .x, gradient (dh/dx, dh/dz) in .yz
vec3 waves(vec2 p) {
  float h = 0.0;
  vec2 g = vec2(0.0);
  for (int i = 0; i < NW; i++) {
    vec2 d = normalize(W[i].xy);
    float k = W[i].z;
    float a = W[i].w;
    float w = sqrt(9.81 * k);
    float ph = dot(d, p) * k + uTime * w + float(i) * 1.7;
    float s = sin(ph);
    float c = cos(ph);
    h += a * s;
    g += a * k * c * d;
  }
  return vec3(h, g);
}
`;

const waterMat = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uSunDir: sunUniform,
    uDeep: { value: new THREE.Color(0.01, 0.07, 0.12) },
    uShallow: { value: new THREE.Color(0.04, 0.28, 0.32) },
  },
  vertexShader: /* glsl */ `
    ${waveGLSL}
    varying vec3 vWorldPos;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vec3 w = waves(wp.xz);
      wp.y += w.x;
      vWorldPos = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragmentShader: /* glsl */ `
    ${waveGLSL}
    ${skyGLSL}
    uniform vec3 uDeep;
    uniform vec3 uShallow;
    varying vec3 vWorldPos;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }
    float vnoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
                 mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
    }
    float fbm(vec2 p) {
      float v = 0.0;
      float a = 0.5;
      for (int i = 0; i < 4; i++) {
        v += a * vnoise(p);
        p = p * 2.03 + 11.7;
        a *= 0.5;
      }
      return v;
    }
    float ripple(vec2 p) {
      vec2 q = p * 1.3;
      return fbm(q + vec2(uTime * 0.25, uTime * 0.4)) + 0.6 * fbm(q * 1.9 - vec2(uTime * 0.35, uTime * 0.2));
    }

    void main() {
      vec3 toCam = cameraPosition - vWorldPos;
      float dist = length(toCam);
      vec3 V = toCam / dist;

      vec3 w = waves(vWorldPos.xz);
      vec2 grad = w.yz;

      // noise ripple detail via finite differences, faded with distance
      float e = 0.05;
      float r0 = ripple(vWorldPos.xz);
      float rx = ripple(vWorldPos.xz + vec2(e, 0.0));
      float rz = ripple(vWorldPos.xz + vec2(0.0, e));
      float fade = 1.0 - smoothstep(20.0, 140.0, dist);
      grad += (vec2(rx - r0, rz - r0) / e) * 0.045 * fade;

      vec3 N = normalize(vec3(-grad.x, 1.0, -grad.y));
      // flatten normals toward the horizon to limit aliasing
      N = normalize(mix(N, vec3(0.0, 1.0, 0.0), smoothstep(60.0, 300.0, dist) * 0.7));

      // fresnel (Schlick, F0 for water ~0.02)
      float cosT = clamp(dot(N, V), 0.0, 1.0);
      float F = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);

      vec3 R = reflect(-V, N);
      R.y = abs(R.y);
      vec3 refl = skyColor(R);

      // body colour: deeper in troughs, lighter on crests
      float crest = clamp(w.x * 1.6 + 0.5, 0.0, 1.0);
      vec3 body = mix(uDeep, uShallow, crest);
      body += uShallow * 0.25 * pow(max(dot(N, uSunDir), 0.0), 2.0);

      vec3 col = mix(body, refl, F);

      // sun glint
      vec3 H = normalize(uSunDir + V);
      float spec = pow(max(dot(N, H), 0.0), 700.0);
      col += vec3(1.0, 0.88, 0.65) * spec * 12.0;

      // blend into horizon at distance
      float fog = smoothstep(80.0, 210.0, dist);
      col = mix(col, horizonColor(), fog);

      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
});

const waterGeo = new THREE.PlaneGeometry(440, 440, 700, 700);
waterGeo.rotateX(-Math.PI / 2);
const water = new THREE.Mesh(waterGeo, waterMat);
water.frustumCulled = false;
scene.add(water);

const clock = new THREE.Clock();
let first = true;
function frame(): void {
  const t = clock.getElapsedTime();
  waterMat.uniforms.uTime.value = t;
  camera.position.y = 2.6 + Math.sin(t * 0.5) * 0.1;
  sky.position.copy(camera.position);
  renderer.render(scene, camera);
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
