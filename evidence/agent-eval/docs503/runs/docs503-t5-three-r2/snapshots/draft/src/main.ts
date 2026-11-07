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
camera.lookAt(0, 2.2, -40);

const sunDir = new THREE.Vector3(-0.35, 0.22, -1).normalize();

// Shared GLSL: sky colour as a function of view direction (linear colour space).
const skyGlsl = /* glsl */ `
uniform vec3 uSunDir;

vec3 skyColor(vec3 d) {
  float h = clamp(d.y, 0.0, 1.0);
  vec3 horizon = vec3(0.62, 0.78, 0.95);
  vec3 zenith  = vec3(0.04, 0.17, 0.52);
  vec3 col = mix(horizon, zenith, pow(h, 0.45));
  float s = max(dot(d, uSunDir), 0.0);
  col += vec3(1.0, 0.65, 0.35) * pow(s, 8.0) * 0.35;   // broad glow
  col += vec3(1.0, 0.85, 0.6) * pow(s, 200.0) * 1.5;   // inner glow
  col += vec3(1.0, 0.95, 0.85) * smoothstep(0.9994, 0.9998, s) * 25.0; // disc
  return col;
}
`;

// ---------------- Sky dome ----------------
const skyMaterial = new THREE.ShaderMaterial({
  uniforms: { uSunDir: { value: sunDir } },
  side: THREE.BackSide,
  depthWrite: false,
  vertexShader: /* glsl */ `
    varying vec3 vDir;
    void main() {
      vDir = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec3 vDir;
    ${skyGlsl}
    void main() {
      gl_FragColor = vec4(skyColor(normalize(vDir)), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), skyMaterial);
sky.renderOrder = -1;
sky.frustumCulled = false;
scene.add(sky);

// ---------------- Water ----------------
const waterGeometry = new THREE.PlaneGeometry(600, 600, 300, 300);
waterGeometry.rotateX(-Math.PI / 2);

const waterMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uSunDir: { value: sunDir },
  },
  vertexShader: /* glsl */ `
    uniform float uTime;
    varying vec3 vWorldPos;
    varying vec3 vNormal;
    varying float vHeight;

    // Gerstner wave: xy = direction, z = steepness, w = wavelength
    vec3 gerstner(vec4 wave, vec2 p, inout vec3 tangent, inout vec3 binormal) {
      float k = 6.28318530718 / wave.w;
      float c = sqrt(9.81 / k);
      vec2 d = normalize(wave.xy);
      float f = k * (dot(d, p) - c * uTime);
      float a = wave.z / k;
      tangent  += vec3(-d.x * d.x * wave.z * sin(f), d.x * wave.z * cos(f), -d.x * d.y * wave.z * sin(f));
      binormal += vec3(-d.x * d.y * wave.z * sin(f), d.y * wave.z * cos(f), -d.y * d.y * wave.z * sin(f));
      return vec3(d.x * a * cos(f), a * sin(f), d.y * a * cos(f));
    }

    void main() {
      vec3 p = position;
      vec3 tangent = vec3(1.0, 0.0, 0.0);
      vec3 binormal = vec3(0.0, 0.0, 1.0);
      vec3 disp = vec3(0.0);
      disp += gerstner(vec4(1.0, 0.3, 0.16, 38.0), p.xz, tangent, binormal);
      disp += gerstner(vec4(-0.6, 1.0, 0.14, 22.0), p.xz, tangent, binormal);
      disp += gerstner(vec4(0.4, -0.9, 0.12, 13.0), p.xz, tangent, binormal);
      disp += gerstner(vec4(-1.0, -0.4, 0.08, 8.0), p.xz, tangent, binormal);
      p += disp;
      vNormal = normalize(cross(binormal, tangent));
      vHeight = disp.y;
      vec4 world = modelMatrix * vec4(p, 1.0);
      vWorldPos = world.xyz;
      gl_Position = projectionMatrix * viewMatrix * world;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    varying vec3 vWorldPos;
    varying vec3 vNormal;
    varying float vHeight;
    ${skyGlsl}

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }
    float vnoise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
                 mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
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
      vec2 q = p * 0.9;
      return fbm(q + vec2(uTime * 0.25, uTime * 0.15)) + fbm(q * 1.7 - vec2(uTime * 0.2, -uTime * 0.12));
    }

    void main() {
      vec3 V = normalize(cameraPosition - vWorldPos);
      float dist = length(cameraPosition - vWorldPos);

      // Noise-based ripple detail perturbs the wave normal; fades with distance.
      vec2 wp = vWorldPos.xz;
      float e = 0.05;
      float h0 = ripple(wp);
      float hx = ripple(wp + vec2(e, 0.0));
      float hz = ripple(wp + vec2(0.0, e));
      float strength = 0.35 / (1.0 + dist * 0.04);
      vec3 N = normalize(vNormal + vec3(-(hx - h0) / e, 0.0, -(hz - h0) / e) * strength);

      // Fresnel (Schlick): more reflection at grazing angles.
      float cosT = clamp(dot(N, V), 0.0, 1.0);
      float fresnel = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);

      vec3 R = reflect(-V, N);
      R.y = abs(R.y);
      vec3 reflection = skyColor(normalize(R));

      // Body colour: deeper in troughs, lighter on crests.
      vec3 deep = vec3(0.005, 0.04, 0.09);
      vec3 shallow = vec3(0.02, 0.18, 0.22);
      float diffuse = clamp(dot(N, uSunDir) * 0.5 + 0.5, 0.0, 1.0);
      vec3 body = mix(deep, shallow, clamp(vHeight * 0.6 + 0.4, 0.0, 1.0));
      body *= 0.5 + 0.8 * diffuse;

      vec3 col = mix(body, reflection, fresnel);

      // Sun specular glint.
      vec3 H = normalize(uSunDir + V);
      float spec = pow(max(dot(N, H), 0.0), 700.0);
      float spec2 = pow(max(dot(N, H), 0.0), 80.0);
      col += vec3(1.0, 0.9, 0.7) * (spec * 12.0 + spec2 * 0.25);

      // Blend into the sky colour toward the horizon.
      vec3 farDir = normalize(vec3(-V.x, 0.0, -V.z));
      vec3 horizonCol = skyColor(vec3(farDir.x, 0.02, farDir.z));
      float fog = 1.0 - exp(-pow(dist * 0.0045, 1.6));
      col = mix(col, horizonCol, fog);

      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
});
const water = new THREE.Mesh(waterGeometry, waterMaterial);
water.frustumCulled = false;
scene.add(water);

const clock = new THREE.Clock();
function frame(): void {
  const t = clock.getElapsedTime();
  waterMaterial.uniforms.uTime.value = t;
  camera.position.y = 3.2 + Math.sin(t * 0.5) * 0.15;
  renderer.render(scene, camera);
  if (!window.__EVAL_READY__) window.__EVAL_READY__ = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
