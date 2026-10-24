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
const camera = new THREE.PerspectiveCamera(55, 640 / 360, 0.1, 2000);
camera.position.set(0, 3.2, 14);
camera.lookAt(0, 2.2, 0);

const sunDir = new THREE.Vector3(-0.35, 0.22, -1).normalize();

// Shared GLSL: procedural sky gradient (linear colour, HDR sun)
const skyGLSL = /* glsl */ `
uniform vec3 uSunDir;

vec3 skyColor(vec3 d) {
  d = normalize(d);
  float h = clamp(d.y, -0.2, 1.0);
  vec3 horizon = vec3(0.62, 0.74, 0.88);
  vec3 zenith  = vec3(0.07, 0.22, 0.62);
  vec3 col = mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.5));
  // warm haze around the sun
  float s = max(dot(d, uSunDir), 0.0);
  col += vec3(1.0, 0.65, 0.35) * pow(s, 8.0) * 0.35;
  col += vec3(1.0, 0.85, 0.6) * pow(s, 64.0) * 0.8;
  // sun disc
  col += vec3(1.0, 0.92, 0.75) * smoothstep(0.9993, 0.9997, s) * 12.0;
  return col;
}
`;

// ---------- Sky dome ----------
const skyMat = new THREE.ShaderMaterial({
  uniforms: { uSunDir: { value: sunDir } },
  side: THREE.BackSide,
  depthWrite: false,
  vertexShader: /* glsl */ `
    varying vec3 vDir;
    void main() {
      vDir = (modelMatrix * vec4(position, 1.0)).xyz - cameraPosition;
      vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      gl_Position = p.xyww; // push to far plane
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec3 vDir;
    ${skyGLSL}
    void main() {
      gl_FragColor = vec4(skyColor(vDir), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), skyMat);
sky.frustumCulled = false;
sky.renderOrder = -1;
scene.add(sky);

// ---------- Water ----------
const waterGeo = new THREE.PlaneGeometry(600, 600, 400, 400);
waterGeo.rotateX(-Math.PI / 2);

const waterMat = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uSunDir: { value: sunDir },
    uDeep: { value: new THREE.Color(0x03213a) },
    uShallow: { value: new THREE.Color(0x14708a) },
  },
  vertexShader: /* glsl */ `
    uniform float uTime;
    varying vec3 vWorldPos;
    varying vec3 vNormalW;

    // direction.xy, steepness, wavelength
    const int N = 5;
    void wave(vec4 w, vec2 p, inout vec3 disp, inout vec3 n) {
      float k = 6.28318 / w.w;
      float c = sqrt(9.8 / k);
      vec2 d = normalize(w.xy);
      float f = k * (dot(d, p) - c * uTime);
      float a = w.z / k;
      disp.x += d.x * a * cos(f);
      disp.z += d.y * a * cos(f);
      disp.y += a * sin(f);
      n.x -= d.x * w.z * cos(f);
      n.z -= d.y * w.z * cos(f);
      n.y -= w.z * sin(f);
    }

    void main() {
      vec3 p = position;
      vec3 disp = vec3(0.0);
      vec3 n = vec3(0.0, 1.0, 0.0);
      wave(vec4( 1.0,  0.3, 0.16, 28.0), p.xz, disp, n);
      wave(vec4( 0.6,  1.0, 0.13, 16.0), p.xz, disp, n);
      wave(vec4(-0.4,  0.9, 0.12,  9.0), p.xz, disp, n);
      wave(vec4( 0.9, -0.5, 0.09,  5.0), p.xz, disp, n);
      wave(vec4(-1.0, -0.2, 0.06,  3.0), p.xz, disp, n);
      p += disp;
      vec4 wp = modelMatrix * vec4(p, 1.0);
      vWorldPos = wp.xyz;
      vNormalW = normalize(n);
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform vec3 uDeep;
    uniform vec3 uShallow;
    varying vec3 vWorldPos;
    varying vec3 vNormalW;
    ${skyGLSL}

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }
    float vnoise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
                 mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
    }
    float fbm(vec2 p) {
      float v = 0.0, a = 0.5;
      for (int i = 0; i < 4; i++) {
        v += a * vnoise(p);
        p = p * 2.03 + vec2(17.1, 9.2);
        a *= 0.5;
      }
      return v;
    }
    float ripple(vec2 p) {
      return fbm(p * 1.3 + vec2(uTime * 0.25, uTime * 0.15))
           + 0.5 * fbm(p * 2.9 - vec2(uTime * 0.2, -uTime * 0.3));
    }

    void main() {
      vec3 V = normalize(cameraPosition - vWorldPos);
      float dist = length(cameraPosition - vWorldPos);

      // noise ripple perturbs the geometric normal (less with distance to avoid shimmer)
      vec2 q = vWorldPos.xz;
      float e = 0.05;
      float h0 = ripple(q);
      float hx = ripple(q + vec2(e, 0.0));
      float hz = ripple(q + vec2(0.0, e));
      vec2 grad = vec2(hx - h0, hz - h0) / e;
      float detail = 0.22 / (1.0 + dist * 0.03);
      vec3 N = normalize(vNormalW + vec3(-grad.x, 0.0, -grad.y) * detail);
      if (dot(N, V) < 0.0) N = reflect(N, V); // avoid back-facing artefacts at grazing angles

      // fresnel (Schlick, water F0 ~ 0.02)
      float cosT = clamp(dot(N, V), 0.0, 1.0);
      float fres = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);

      // reflected sky; keep reflection ray above the horizon
      vec3 R = reflect(-V, N);
      R.y = abs(R.y);
      vec3 refl = skyColor(R);

      // body colour
      float depthMix = clamp(0.5 + 0.5 * (vWorldPos.y) / 1.0, 0.0, 1.0);
      vec3 body = mix(uDeep, uShallow, depthMix * 0.6 + 0.2 * fbm(q * 0.15));
      body += uShallow * 0.25 * pow(clamp(1.0 - cosT, 0.0, 1.0), 2.0) * clamp(vWorldPos.y * 0.5 + 0.5, 0.0, 1.0);

      vec3 col = mix(body, refl, fres);

      // sun specular glint
      vec3 H = normalize(uSunDir + V);
      float nh = max(dot(N, H), 0.0);
      float spec = pow(nh, 600.0) * 40.0 + pow(nh, 80.0) * 1.2;
      col += vec3(1.0, 0.9, 0.7) * spec * smoothstep(0.0, 0.1, uSunDir.y);

      // distance haze toward horizon colour
      float fog = 1.0 - exp(-dist * 0.0045);
      col = mix(col, skyColor(vec3(normalize(-V.xz * -1.0).x, 0.02, normalize(-V.xz * -1.0).y)) * 0.95, fog * 0.6);

      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
});
const water = new THREE.Mesh(waterGeo, waterMat);
water.frustumCulled = false;
scene.add(water);

const clock = new THREE.Clock();
let first = true;
function frame(): void {
  const t = clock.getElapsedTime();
  waterMat.uniforms.uTime.value = t;
  camera.position.y = 3.2 + Math.sin(t * 0.5) * 0.15;
  camera.lookAt(0, 2.2, 0);
  renderer.render(scene, camera);
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
