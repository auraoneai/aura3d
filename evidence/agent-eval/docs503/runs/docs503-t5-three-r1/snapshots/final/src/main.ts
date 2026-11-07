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
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 640 / 360, 0.1, 6000);
camera.position.set(0, 2.6, 0);
camera.lookAt(0, 1.6, -40);

const sunDir = new THREE.Vector3(0.28, 0.2, -1).normalize();

// Shared sky function (linear colour space, HDR values).
const skyGLSL = /* glsl */ `
  uniform vec3 uSunDir;
  vec3 skyColor(vec3 dir) {
    float h = clamp(dir.y, 0.0, 1.0);
    vec3 horizon = vec3(0.62, 0.74, 0.88);
    vec3 zenith  = vec3(0.06, 0.20, 0.50);
    vec3 col = mix(horizon, zenith, pow(h, 0.45));
    float s = max(dot(normalize(dir), uSunDir), 0.0);
    col += vec3(1.0, 0.75, 0.45) * pow(s, 24.0) * 0.35;
    col += vec3(1.0, 0.85, 0.6) * pow(s, 400.0) * 3.0;
    col += vec3(1.0, 0.95, 0.85) * smoothstep(0.9995, 0.9998, s) * 25.0;
    return col;
  }
`;

// ---- Sky dome ----
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  depthTest: false,
  uniforms: { uSunDir: { value: sunDir } },
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
      gl_FragColor = vec4(skyColor(normalize(vDir)), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(4000, 32, 16), skyMat);
sky.renderOrder = -1;
sky.frustumCulled = false;
scene.add(sky);

// ---- Water geometry: polar grid, dense near the camera ----
function buildWaterGeometry(rings: number, segments: number, rMin: number, rMax: number): THREE.BufferGeometry {
  const positions = new Float32Array((rings + 1) * (segments + 1) * 3);
  const indices: number[] = [];
  let p = 0;
  for (let i = 0; i <= rings; i++) {
    const r = i === 0 ? 0 : rMin * Math.pow(rMax / rMin, (i - 1) / (rings - 1));
    for (let j = 0; j <= segments; j++) {
      const a = (j / segments) * Math.PI * 2;
      positions[p++] = Math.cos(a) * r;
      positions[p++] = 0;
      positions[p++] = Math.sin(a) * r;
    }
  }
  const stride = segments + 1;
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * stride + j;
      const b = a + stride;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setIndex(indices);
  return g;
}
const waterGeo = buildWaterGeometry(220, 384, 0.4, 3000);

const waterMat = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uSunDir: { value: sunDir },
  },
  vertexShader: /* glsl */ `
    uniform float uTime;
    varying vec3 vWorldPos;
    varying vec3 vNormal;
    varying float vHeight;

    const float G = 9.8;
    // dir.xy, wavelength, amplitude
    void addWave(vec2 d, float L, float amp, float steep, vec2 p, inout vec3 disp, inout vec3 n) {
      d = normalize(d);
      float k = 6.2831853 / L;
      float w = sqrt(G * k);
      float f = k * dot(d, p) - w * uTime;
      float c = cos(f), s = sin(f);
      disp.x += steep * amp * d.x * c;
      disp.z += steep * amp * d.y * c;
      disp.y += amp * s;
      n.x -= d.x * k * amp * c;
      n.z -= d.y * k * amp * c;
      n.y -= steep * k * amp * s;
    }

    void main() {
      vec2 p = position.xz;
      float dist = length(p);
      float fade = 1.0 - smoothstep(400.0, 2500.0, dist) * 0.6;
      vec3 disp = vec3(0.0);
      vec3 n = vec3(0.0, 1.0, 0.0);
      addWave(vec2( 1.0, -0.6), 28.0, 0.55 * fade, 0.8, p, disp, n);
      addWave(vec2( 0.6, -1.0), 16.0, 0.30 * fade, 0.8, p, disp, n);
      addWave(vec2(-0.4, -1.0),  9.0, 0.16 * fade, 0.7, p, disp, n);
      addWave(vec2( 1.0,  0.2),  5.0, 0.08 * fade, 0.6, p, disp, n);
      addWave(vec2(-0.8, -0.5),  3.0, 0.04 * fade, 0.6, p, disp, n);

      vec3 pos = position + disp;
      vec4 world = modelMatrix * vec4(pos, 1.0);
      vWorldPos = world.xyz;
      vNormal = normalize(n);
      vHeight = disp.y;
      gl_Position = projectionMatrix * viewMatrix * world;
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
      float a = hash(i), b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
      return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
    }
    float ripple(vec2 p) {
      float t = uTime;
      float v = 0.0;
      float a = 0.5;
      mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
      p += vec2(t * 0.4, t * 0.25);
      for (int i = 0; i < 4; i++) {
        v += a * noise(p + vec2(0.0, t * 0.15 * float(i + 1)));
        p = rot * p * 2.03;
        a *= 0.5;
      }
      return v;
    }

    void main() {
      vec3 V = normalize(cameraPosition - vWorldPos);
      float dist = length(cameraPosition - vWorldPos);

      // Wave normal plus noise ripple detail (finite-difference gradient).
      vec3 N = normalize(vNormal);
      vec2 rp = vWorldPos.xz * 1.6;
      float e = 0.05;
      float h0 = ripple(rp);
      float hx = ripple(rp + vec2(e, 0.0));
      float hz = ripple(rp + vec2(0.0, e));
      vec2 grad = vec2(hx - h0, hz - h0) / e;
      float detail = 0.09 * (1.0 - smoothstep(30.0, 250.0, dist));
      N = normalize(N + vec3(-grad.x, 0.0, -grad.y) * detail);
      // Flatten very distant normals to reduce shimmering.
      N = normalize(mix(N, vec3(0.0, 1.0, 0.0), smoothstep(200.0, 1800.0, dist) * 0.85));
      if (dot(N, V) < 0.02) N = normalize(N + V * (0.02 - dot(N, V)));

      // Fresnel (Schlick, water F0 ~ 0.02).
      float cosT = clamp(dot(N, V), 0.0, 1.0);
      float fresnel = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);

      // Reflected sky.
      vec3 R = reflect(-V, N);
      R.y = abs(R.y);
      vec3 reflection = skyColor(R);

      // Body colour: deep water with brighter scatter on wave crests.
      vec3 deep = vec3(0.005, 0.03, 0.07);
      vec3 shallow = vec3(0.02, 0.16, 0.20);
      float crest = smoothstep(-0.6, 0.9, vHeight);
      vec3 body = mix(deep, shallow, crest * 0.8);
      body += shallow * 0.3 * pow(max(dot(N, normalize(uSunDir + V)), 0.0), 2.0);

      vec3 col = mix(body, reflection, fresnel);

      // Sun glint.
      vec3 H = normalize(uSunDir + V);
      float nh = max(dot(N, H), 0.0);
      float spec = pow(nh, 700.0) * 12.0 + pow(nh, 80.0) * 0.4;
      col += vec3(1.0, 0.88, 0.7) * spec * step(0.0, uSunDir.y);

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
  waterMat.uniforms.uTime.value = clock.getElapsedTime();
  renderer.render(scene, camera);
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
