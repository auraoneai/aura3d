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
camera.position.set(0, 2.6, 0);
camera.lookAt(0, 2.0, -50);

const sunDir = new THREE.Vector3(-0.35, 0.2, -1).normalize();

// Shared GLSL: gradient sky (all colours in linear space).
const skyGLSL = /* glsl */ `
uniform vec3 uSunDir;

vec3 skyBase(vec3 d) {
  float h = clamp(d.y, 0.0, 1.0);
  vec3 horizon = vec3(0.60, 0.68, 0.78);
  vec3 mid     = vec3(0.17, 0.33, 0.62);
  vec3 zenith  = vec3(0.03, 0.10, 0.30);
  vec3 c = mix(horizon, mid, smoothstep(0.0, 0.25, h));
  c = mix(c, zenith, smoothstep(0.2, 0.9, h));
  // warm glow around the sun
  float s = max(dot(d, uSunDir), 0.0);
  c += vec3(1.0, 0.6, 0.3) * (pow(s, 8.0) * 0.25 + pow(s, 64.0) * 0.4);
  return c;
}

vec3 sunDisc(vec3 d) {
  float s = max(dot(d, uSunDir), 0.0);
  return vec3(1.0, 0.85, 0.6) * smoothstep(0.9993, 0.9998, s) * 25.0;
}
`;

const sunUniform = { value: sunDir };

// ---- Sky dome ----
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  uniforms: { uSunDir: sunUniform },
  vertexShader: /* glsl */ `
    varying vec3 vDir;
    void main() {
      vDir = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec3 vDir;
    ${skyGLSL}
    void main() {
      vec3 d = normalize(vDir);
      vec3 col = skyBase(d) + sunDisc(d);
      if (d.y < 0.0) col = mix(skyBase(vec3(d.x, 0.0, d.z)), vec3(0.02, 0.06, 0.1), 1.0 - smoothstep(-0.2, 0.0, d.y));
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 32), skyMat);
sky.renderOrder = -1;
sky.frustumCulled = false;
scene.add(sky);

// ---- Water ----
const SIZE = 260;
const SEGMENTS = 520; // subdivided grid: waves are real geometry
const waterGeo = new THREE.PlaneGeometry(SIZE, SIZE, SEGMENTS, SEGMENTS);
waterGeo.rotateX(-Math.PI / 2);

const waterMat = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uSunDir: sunUniform,
  },
  vertexShader: /* glsl */ `
    uniform float uTime;
    varying vec3 vWorldPos;
    varying vec3 vNormal;
    varying float vHeight;

    // direction.xy, wavelength, amplitude ; steepness in w of second array
    void wave(vec2 dir, float wl, float amp, float steep, vec2 p, inout vec3 disp, inout vec3 nrm) {
      vec2 d = normalize(dir);
      float k = 6.2831853 / wl;
      float c = sqrt(9.81 / k);
      float ph = k * dot(d, p) - c * k * uTime;
      float s = sin(ph), co = cos(ph);
      disp.xz += steep * amp * d * co;
      disp.y  += amp * s;
      nrm.xz  -= d * k * amp * co;
      nrm.y   -= steep * k * amp * s;
    }

    void main() {
      vec2 p = position.xz;
      vec3 disp = vec3(0.0);
      vec3 nrm = vec3(0.0, 1.0, 0.0);
      wave(vec2( 1.0,  0.6), 22.0, 0.55, 0.6, p, disp, nrm);
      wave(vec2(-0.4,  1.0), 13.0, 0.32, 0.6, p, disp, nrm);
      wave(vec2( 0.8, -0.9),  7.5, 0.16, 0.5, p, disp, nrm);
      wave(vec2(-1.0, -0.3),  4.2, 0.08, 0.5, p, disp, nrm);
      wave(vec2( 0.2,  1.0),  2.6, 0.04, 0.4, p, disp, nrm);

      vec3 pos = position + disp;
      vec4 wp = modelMatrix * vec4(pos, 1.0);
      vWorldPos = wp.xyz;
      vNormal = normalize(nrm);
      vHeight = disp.y;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    varying vec3 vWorldPos;
    varying vec3 vNormal;
    varying float vHeight;
    ${skyGLSL}

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
                 mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
    }
    float ripple(vec2 p) {
      float t = uTime;
      float a = 0.0, amp = 0.5;
      mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
      vec2 q = p;
      for (int i = 0; i < 4; i++) {
        a += amp * noise(q + vec2(t * 0.35, -t * 0.25) * (1.0 + float(i) * 0.4));
        q = rot * q * 2.03;
        amp *= 0.5;
      }
      return a;
    }

    void main() {
      vec3 toCam = cameraPosition - vWorldPos;
      float dist = length(toCam);
      vec3 V = toCam / dist;

      // noise-based ripple detail perturbs the geometric normal
      vec2 rp = vWorldPos.xz * 1.1;
      float e = 0.05;
      float h0 = ripple(rp);
      float hx = ripple(rp + vec2(e, 0.0));
      float hz = ripple(rp + vec2(0.0, e));
      vec2 grad = vec2(hx - h0, hz - h0) / e;
      float detail = 0.16 * (1.0 - smoothstep(15.0, 70.0, dist));
      vec3 N = normalize(vNormal + vec3(-grad.x, 0.0, -grad.y) * detail);

      float NdotV = clamp(dot(N, V), 0.0, 1.0);
      float fres = 0.02 + 0.98 * pow(1.0 - NdotV, 5.0);

      // reflection of the sky
      vec3 R = reflect(-V, N);
      R.y = abs(R.y);
      vec3 refl = skyBase(R);

      // water body colour
      vec3 deep = vec3(0.005, 0.04, 0.07);
      vec3 shallow = vec3(0.02, 0.18, 0.20);
      vec3 body = mix(deep, shallow, clamp(vHeight * 0.8 + 0.4, 0.0, 1.0) * NdotV);

      vec3 col = mix(body, refl, fres);

      // sun glint
      vec3 L = normalize(uSunDir);
      float sr = max(dot(R, L), 0.0);
      vec3 spec = vec3(1.0, 0.85, 0.6) * (pow(sr, 900.0) * 30.0 + pow(sr, 120.0) * 1.2);
      col += spec * fres * 1.5 + spec * 0.15;

      // distance haze into the sky colour at the horizon
      vec3 viewDir = normalize(vWorldPos - cameraPosition);
      vec3 haze = skyBase(vec3(viewDir.x, max(viewDir.y, 0.0), viewDir.z));
      float fog = smoothstep(40.0, 120.0, dist);
      col = mix(col, haze, fog);

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
function frame(): void {
  const t = clock.getElapsedTime();
  waterMat.uniforms.uTime.value = t;
  camera.position.y = 2.6 + Math.sin(t * 0.5) * 0.08;
  sky.position.copy(camera.position);
  renderer.render(scene, camera);
  if (!window.__EVAL_READY__) window.__EVAL_READY__ = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
