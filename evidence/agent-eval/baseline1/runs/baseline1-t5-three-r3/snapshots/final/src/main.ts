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
const camera = new THREE.PerspectiveCamera(50, 640 / 360, 0.1, 2000);
camera.position.set(0, 3, 8);
camera.lookAt(0, 0.3, -30);

const sunDir = new THREE.Vector3(-0.28, 0.17, -1).normalize();

// Shared GLSL: procedural gradient sky (linear colour space).
const skyGLSL = /* glsl */ `
  uniform vec3 uSunDir;

  vec3 skyColor(vec3 d, bool withSun) {
    float h = clamp(d.y, 0.0, 1.0);
    vec3 horizon = vec3(0.62, 0.74, 0.88);
    vec3 mid     = vec3(0.20, 0.40, 0.75);
    vec3 zenith  = vec3(0.04, 0.14, 0.45);
    vec3 col = mix(horizon, mid, smoothstep(0.0, 0.25, h));
    col = mix(col, zenith, smoothstep(0.2, 0.9, h));
    float sd = max(dot(d, uSunDir), 0.0);
    // warm glow around the sun
    col += vec3(1.0, 0.65, 0.35) * pow(sd, 8.0) * 0.35;
    col += vec3(1.0, 0.8, 0.55) * pow(sd, 64.0) * 0.6;
    if (withSun) {
      col += vec3(1.0, 0.9, 0.7) * smoothstep(0.9993, 0.9998, sd) * 20.0;
    }
    return col;
  }
`;

// ---------------- Sky dome ----------------
const skyUniforms = {
  uSunDir: { value: sunDir },
};
const skyMat = new THREE.ShaderMaterial({
  uniforms: skyUniforms,
  side: THREE.BackSide,
  depthWrite: false,
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
      vec3 d = normalize(vDir);
      gl_FragColor = vec4(skyColor(d, true), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 32), skyMat);
sky.renderOrder = -1;
sky.frustumCulled = false;
scene.add(sky);

// ---------------- Water ----------------
const waterUniforms = {
  uTime: { value: 0 },
  uSunDir: { value: sunDir },
};

const waterMat = new THREE.ShaderMaterial({
  uniforms: waterUniforms,
  vertexShader: /* glsl */ `
    uniform float uTime;
    varying vec3 vWorldPos;
    varying vec3 vNormalW;
    varying float vHeight;

    // direction.xy, amplitude, wavelength
    const int NW = 6;

    void addWave(vec2 p, vec2 dir, float amp, float wl, float speed,
                 inout float h, inout vec2 grad) {
      float k = 6.28318530718 / wl;
      float ph = k * dot(dir, p) + uTime * speed;
      float s = sin(ph);
      float e = exp(s - 1.0);          // sharpened crests
      h += amp * e;
      float dh = amp * e * cos(ph) * k;
      grad += dh * dir;
    }

    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vec2 p = wp.xz;
      float h = 0.0;
      vec2 grad = vec2(0.0);
      addWave(p, normalize(vec2( 0.15, -1.0)), 0.55, 22.0, 1.30, h, grad);
      addWave(p, normalize(vec2( 0.60, -0.8)), 0.35, 14.0, 1.60, h, grad);
      addWave(p, normalize(vec2(-0.55, -0.9)), 0.28, 9.0,  1.90, h, grad);
      addWave(p, normalize(vec2( 0.90,  0.4)), 0.14, 6.0,  2.30, h, grad);
      addWave(p, normalize(vec2(-0.80,  0.5)), 0.10, 4.5,  2.60, h, grad);
      addWave(p, normalize(vec2( 0.20,  1.0)), 0.06, 3.2,  3.10, h, grad);
      wp.y += h;
      vHeight = h;
      vWorldPos = wp.xyz;
      vNormalW = normalize(vec3(-grad.x, 1.0, -grad.y));
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    varying vec3 vWorldPos;
    varying vec3 vNormalW;
    varying float vHeight;
    ${skyGLSL}

    // --- value noise / fbm ---
    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }
    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
    }
    float fbm(vec2 p) {
      float v = 0.0;
      float a = 0.5;
      mat2 r = mat2(1.6, 1.2, -1.2, 1.6);
      for (int i = 0; i < 4; i++) {
        v += a * noise(p);
        p = r * p;
        a *= 0.5;
      }
      return v;
    }
    float rippleHeight(vec2 p) {
      return fbm(p * 1.3 + vec2(uTime * 0.25, uTime * 0.18))
           + 0.6 * fbm(p * 2.7 - vec2(uTime * 0.3, -uTime * 0.22));
    }

    void main() {
      vec3 toCam = cameraPosition - vWorldPos;
      float dist = length(toCam);
      vec3 V = toCam / dist;

      // Procedural ripple detail perturbs the geometric normal.
      vec2 p = vWorldPos.xz;
      float e = 0.08;
      float h0 = rippleHeight(p);
      float hx = rippleHeight(p + vec2(e, 0.0));
      float hz = rippleHeight(p + vec2(0.0, e));
      vec2 rg = vec2(hx - h0, hz - h0) / e;
      float detailFade = 1.0 - smoothstep(30.0, 140.0, dist);
      vec3 N = normalize(vNormalW + vec3(-rg.x, 0.0, -rg.y) * 0.12 * detailFade);

      float NdV = clamp(dot(N, V), 0.0, 1.0);
      float fresnel = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);

      // Reflection of the sky
      vec3 R = reflect(-V, N);
      R.y = abs(R.y);
      vec3 reflected = skyColor(normalize(R), false);

      // Body colour (very simple scattering approximation)
      vec3 deep    = vec3(0.005, 0.04, 0.09);
      vec3 shallow = vec3(0.03, 0.22, 0.28);
      float sss = clamp(vHeight * 0.9 + 0.15, 0.0, 1.0);
      vec3 body = mix(deep, shallow, sss);
      body += shallow * 0.25 * pow(max(dot(normalize(vec3(uSunDir.x, 0.0, uSunDir.z)), -V), 0.0), 2.0) * sss;

      vec3 col = mix(body, reflected, fresnel);

      // Sun glint
      vec3 Rs = reflect(-V, N);
      float sd = max(dot(Rs, uSunDir), 0.0);
      float spec = pow(sd, 500.0) * 6.0 + pow(sd, 60.0) * 0.35;
      col += vec3(1.0, 0.88, 0.65) * spec;

      // Blend into the horizon colour in the distance
      float fog = smoothstep(80.0, 280.0, dist);
      vec3 hz2 = skyColor(normalize(vec3(-V.x, 0.0, -V.z)), false);
      col = mix(col, hz2, fog);

      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
});

const SIZE = 600;
const SEG = 600;
const waterGeo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
waterGeo.rotateX(-Math.PI / 2);
const water = new THREE.Mesh(waterGeo, waterMat);
water.position.set(0, 0, -SIZE / 2 + 40);
water.frustumCulled = false;
scene.add(water);

// ---------------- Loop ----------------
const clock = new THREE.Clock();
let first = true;
function frame(): void {
  const t = clock.getElapsedTime();
  waterUniforms.uTime.value = t;
  camera.position.y = 3 + Math.sin(t * 0.5) * 0.1;
  camera.lookAt(0, 0.3, -30);
  sky.position.copy(camera.position);
  renderer.render(scene, camera);
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
