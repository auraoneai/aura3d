import {
  camera,
  createAuraApp,
  interactions,
  lights,
  material,
  primitives,
  scene
} from "@aura3d/engine";

type Vec3 = [number, number, number];

interface Particle {
  age: number;
  life: number;
  position: Vec3;
  velocity: Vec3;
  radius: number;
  bounceCount: number;
}

const fountainScene = scene()
  .background("#071018")
  .add(
    primitives.plane({
      name: "visible ground collision plane",
      material: material.pbr({ color: "#193039", roughness: 0.62, metallic: 0.05 })
    })
      .position(0, 0, 0)
      .scale([7.2, 1, 5.8])
  )
  .add(
    primitives.sphere({
      name: "particle fountain emitter",
      material: material.emissive({ color: "#21d4ff", emissive: "#4feaff" })
    })
      .position(0, 0.09, 0)
      .scale([0.18, 0.08, 0.18])
  )
  .add(lights.ambient({ intensity: 0.32, color: "#bfe8ff" }))
  .add(lights.directional({ position: [-2.5, 4, 2.5], intensity: 1.7, color: "#ffffff" }))
  .add(interactions.orbit())
  .camera(camera.perspective({ position: [3.2, 2.3, 4.6], target: [0, 1.0, 0], fov: 44 }));

createAuraApp("#app", {
  diagnostics: false,
  scene: fountainScene
});

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("Missing #app container.");
}

document.body.style.margin = "0";
document.body.style.overflow = "hidden";
document.body.style.background = "#071018";
app.style.position = "fixed";
app.style.inset = "0";

const canvas = document.createElement("canvas");
canvas.setAttribute("aria-label", "Animated particle fountain with ground collision plane");
canvas.style.position = "absolute";
canvas.style.inset = "0";
canvas.style.width = "100%";
canvas.style.height = "100%";
canvas.style.display = "block";
canvas.style.zIndex = "2";
app.appendChild(canvas);

const panel = document.createElement("section");
panel.className = "controls";
panel.innerHTML = `
  <label for="emission-rate">Emission rate</label>
  <div class="rate-row">
    <input id="emission-rate" type="range" min="35" max="260" step="5" value="145" />
    <output id="rate-value" for="emission-rate">145 / sec</output>
  </div>
`;
document.body.appendChild(panel);

const style = document.createElement("style");
style.textContent = `
  .controls {
    position: fixed;
    left: 20px;
    bottom: 20px;
    z-index: 4;
    width: min(360px, calc(100vw - 40px));
    box-sizing: border-box;
    padding: 14px 16px 15px;
    color: #edf8ff;
    background: rgba(5, 12, 18, 0.78);
    border: 1px solid rgba(126, 218, 255, 0.42);
    border-radius: 8px;
    box-shadow: 0 18px 46px rgba(0, 0, 0, 0.34);
    font: 600 14px/1.3 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    backdrop-filter: blur(12px);
  }

  .rate-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 12px;
    align-items: center;
    margin-top: 10px;
  }

  #emission-rate {
    width: 100%;
    accent-color: #43d8ff;
  }

  #rate-value {
    min-width: 78px;
    color: #9defff;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
`;
document.head.appendChild(style);

const rateInput = document.querySelector<HTMLInputElement>("#emission-rate");
const rateValue = document.querySelector<HTMLOutputElement>("#rate-value");
if (!rateInput || !rateValue) {
  throw new Error("Emission-rate control failed to initialize.");
}

const gl = createWebGlContext(canvas);

const vertexShader = compileShader(
  gl,
  gl.VERTEX_SHADER,
  `
    attribute vec3 aPosition;
    attribute vec4 aColor;
    attribute float aSize;
    uniform mat4 uViewProjection;
    uniform float uPixelRatio;
    varying vec4 vColor;

    void main() {
      vec4 viewPosition = uViewProjection * vec4(aPosition, 1.0);
      gl_Position = viewPosition;
      gl_PointSize = aSize * uPixelRatio * (1.0 / max(0.28, viewPosition.w));
      vColor = aColor;
    }
  `
);

const fragmentShader = compileShader(
  gl,
  gl.FRAGMENT_SHADER,
  `
    precision mediump float;
    uniform bool uRoundPoints;
    varying vec4 vColor;

    void main() {
      float alpha = vColor.a;
      if (uRoundPoints) {
        vec2 point = gl_PointCoord - vec2(0.5);
        float d = length(point);
        if (d > 0.5) {
          discard;
        }
        alpha *= smoothstep(0.5, 0.05, d);
      }
      gl_FragColor = vec4(vColor.rgb, alpha);
    }
  `
);

const program = createProgram(gl, vertexShader, fragmentShader);
const positionLocation = gl.getAttribLocation(program, "aPosition");
const colorLocation = gl.getAttribLocation(program, "aColor");
const sizeLocation = gl.getAttribLocation(program, "aSize");
const viewProjectionLocation = gl.getUniformLocation(program, "uViewProjection");
const pixelRatioLocation = gl.getUniformLocation(program, "uPixelRatio");
const roundPointsLocation = gl.getUniformLocation(program, "uRoundPoints");

const particleBuffer = gl.createBuffer();
const groundBuffer = gl.createBuffer();
const emitterBuffer = gl.createBuffer();
if (
  !particleBuffer ||
  !groundBuffer ||
  !emitterBuffer ||
  !viewProjectionLocation ||
  !pixelRatioLocation ||
  !roundPointsLocation
) {
  throw new Error("Unable to allocate fountain render resources.");
}

const particles: Particle[] = [];
const particleData = new Float32Array(900 * 8);
const gravity = -5.2;
let emissionAccumulator = 0;
let emissionRate = Number(rateInput.value);
let previousTime = performance.now();

rateInput.addEventListener("input", () => {
  emissionRate = Number(rateInput.value);
  rateValue.value = `${emissionRate} / sec`;
  rateValue.textContent = `${emissionRate} / sec`;
});

function animate(now: number): void {
  const dt = Math.min(0.033, (now - previousTime) / 1000);
  previousTime = now;
  resizeCanvas();
  updateParticles(dt);
  render(now / 1000);
  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);

function updateParticles(dt: number): void {
  emissionAccumulator += emissionRate * dt;
  while (emissionAccumulator >= 1) {
    spawnParticle();
    emissionAccumulator -= 1;
  }

  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const particle = particles[i];
    particle.age += dt;
    particle.velocity[1] += gravity * dt;
    particle.position[0] += particle.velocity[0] * dt;
    particle.position[1] += particle.velocity[1] * dt;
    particle.position[2] += particle.velocity[2] * dt;

    if (particle.position[1] <= particle.radius) {
      particle.position[1] = particle.radius;
      if (particle.velocity[1] < 0) {
        particle.velocity[1] *= -0.34;
        particle.velocity[0] *= 0.72;
        particle.velocity[2] *= 0.72;
        particle.bounceCount += 1;
      }
    }

    if (particle.age >= particle.life || particle.bounceCount > 1) {
      particles.splice(i, 1);
    }
  }
}

function spawnParticle(): void {
  if (particles.length >= 900) {
    particles.shift();
  }

  const side = Math.random() < 0.5 ? -1 : 1;
  const spread = 0.85 + Math.random() * 1.25;
  const upward = 3.8 + Math.random() * 1.25;
  const startJitter = 0.025;

  particles.push({
    age: 0,
    life: 2.65 + Math.random() * 0.7,
    position: [
      (Math.random() - 0.5) * startJitter,
      0.18,
      (Math.random() - 0.5) * startJitter
    ],
    velocity: [
      side * spread,
      upward,
      (Math.random() - 0.5) * spread * 0.55
    ],
    radius: 0.035,
    bounceCount: 0
  });
}

function render(seconds: number): void {
  const aspect = canvas.width / canvas.height;
  const projection = perspective((44 * Math.PI) / 180, aspect, 0.1, 100);
  const eye: Vec3 = [3.6, 2.35, 5.1];
  const target: Vec3 = [0, 1.02, 0];
  const view = lookAt(eye, target, [0, 1, 0]);
  const viewProjection = multiplyMatrices(projection, view);

  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.027, 0.063, 0.094, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.useProgram(program);
  gl.uniformMatrix4fv(viewProjectionLocation, false, viewProjection);
  gl.uniform1f(pixelRatioLocation, window.devicePixelRatio || 1);

  drawGround(seconds);
  drawEmitter(seconds);
  drawParticles();
}

function drawGround(seconds: number): void {
  const data: number[] = [];
  pushVertex(data, [-4.2, -0.01, -2.9], [0.08, 0.18, 0.2, 0.88], 1);
  pushVertex(data, [4.2, -0.01, -2.9], [0.08, 0.18, 0.2, 0.88], 1);
  pushVertex(data, [4.2, -0.01, 2.9], [0.12, 0.29, 0.32, 0.88], 1);
  pushVertex(data, [-4.2, -0.01, -2.9], [0.08, 0.18, 0.2, 0.88], 1);
  pushVertex(data, [4.2, -0.01, 2.9], [0.12, 0.29, 0.32, 0.88], 1);
  pushVertex(data, [-4.2, -0.01, 2.9], [0.1, 0.24, 0.27, 0.88], 1);
  uploadAndDraw(groundBuffer, new Float32Array(data), gl.TRIANGLES, false);
  data.length = 0;

  for (let i = -8; i <= 8; i += 1) {
    const major = i === 0;
    const alpha = major ? 0.95 : 0.48;
    pushVertex(data, [-4, 0.012, i * 0.35], major ? [0.48, 1, 1, alpha] : [0.36, 0.76, 0.84, alpha], 3);
    pushVertex(data, [4, 0.012, i * 0.35], major ? [0.48, 1, 1, alpha] : [0.36, 0.76, 0.84, alpha], 3);
    pushVertex(data, [i * 0.5, 0.012, -2.8], major ? [0.48, 1, 1, alpha] : [0.36, 0.76, 0.84, alpha], 3);
    pushVertex(data, [i * 0.5, 0.012, 2.8], major ? [0.48, 1, 1, alpha] : [0.36, 0.76, 0.84, alpha], 3);
  }

  const pulse = 0.52 + Math.sin(seconds * 4) * 0.18;
  pushVertex(data, [-0.28, 0.011, -0.28], [0.1, 0.95, 1, pulse], 7);
  pushVertex(data, [0.28, 0.011, -0.28], [0.1, 0.95, 1, pulse], 7);
  pushVertex(data, [0.28, 0.011, -0.28], [0.1, 0.95, 1, pulse], 7);
  pushVertex(data, [0.28, 0.011, 0.28], [0.1, 0.95, 1, pulse], 7);
  pushVertex(data, [0.28, 0.011, 0.28], [0.1, 0.95, 1, pulse], 7);
  pushVertex(data, [-0.28, 0.011, 0.28], [0.1, 0.95, 1, pulse], 7);
  pushVertex(data, [-0.28, 0.011, 0.28], [0.1, 0.95, 1, pulse], 7);
  pushVertex(data, [-0.28, 0.011, -0.28], [0.1, 0.95, 1, pulse], 7);

  uploadAndDraw(groundBuffer, new Float32Array(data), gl.LINES, false);
}

function drawEmitter(seconds: number): void {
  const data: number[] = [];
  const segments = 28;
  const baseRadius = 0.16;
  const topRadius = 0.07 + Math.sin(seconds * 8) * 0.01;
  const baseY = 0.02;
  const topY = 0.24;
  for (let i = 0; i < segments; i += 1) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const color: [number, number, number, number] = [0.18, 0.95, 1, 0.96];
    pushVertex(data, [Math.cos(a0) * baseRadius, baseY, Math.sin(a0) * baseRadius], color, 8);
    pushVertex(data, [Math.cos(a1) * baseRadius, baseY, Math.sin(a1) * baseRadius], color, 8);
    pushVertex(data, [Math.cos(a0) * topRadius, topY, Math.sin(a0) * topRadius], [0.8, 1, 1, 1], 9);
    pushVertex(data, [Math.cos(a1) * topRadius, topY, Math.sin(a1) * topRadius], [0.8, 1, 1, 1], 9);
    pushVertex(data, [Math.cos(a0) * baseRadius, baseY, Math.sin(a0) * baseRadius], [0.08, 0.62, 0.85, 0.8], 6);
    pushVertex(data, [Math.cos(a0) * topRadius, topY, Math.sin(a0) * topRadius], [0.8, 1, 1, 0.95], 6);
  }
  uploadAndDraw(emitterBuffer, new Float32Array(data), gl.LINES, false);
}

function drawParticles(): void {
  let offset = 0;
  for (const particle of particles) {
    const t = particle.age / particle.life;
    const color = lifetimeColor(t, particle.bounceCount > 0);
    particleData[offset++] = particle.position[0];
    particleData[offset++] = particle.position[1];
    particleData[offset++] = particle.position[2];
    particleData[offset++] = color[0];
    particleData[offset++] = color[1];
    particleData[offset++] = color[2];
    particleData[offset++] = color[3];
    particleData[offset++] = 48 - t * 18;
  }

  uploadAndDraw(particleBuffer, particleData.subarray(0, offset), gl.POINTS, true);
}

function lifetimeColor(t: number, bounced: boolean): [number, number, number, number] {
  if (bounced) {
    return [1, 0.18, 0.1, 0.86 * (1 - t)];
  }
  if (t < 0.25) {
    const k = t / 0.25;
    return [0.1 + k * 0.18, 0.82 + k * 0.18, 1, 0.98];
  }
  if (t < 0.58) {
    const k = (t - 0.25) / 0.33;
    return [0.28 + k * 0.72, 1 - k * 0.12, 1 - k * 0.82, 0.96];
  }
  const k = (t - 0.58) / 0.42;
  return [1, 0.88 - k * 0.68, 0.18 + k * 0.64, 0.9 * (1 - k * 0.55)];
}

function pushVertex(data: number[], position: Vec3, color: [number, number, number, number], size: number): void {
  data.push(position[0], position[1], position[2], color[0], color[1], color[2], color[3], size);
}

function uploadAndDraw(buffer: WebGLBuffer, data: Float32Array, mode: number, roundPoints: boolean): void {
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
  gl.uniform1i(roundPointsLocation, roundPoints ? 1 : 0);
  const stride = 8 * Float32Array.BYTES_PER_ELEMENT;
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(colorLocation);
  gl.vertexAttribPointer(colorLocation, 4, gl.FLOAT, false, stride, 3 * Float32Array.BYTES_PER_ELEMENT);
  gl.enableVertexAttribArray(sizeLocation);
  gl.vertexAttribPointer(sizeLocation, 1, gl.FLOAT, false, stride, 7 * Float32Array.BYTES_PER_ELEMENT);
  gl.drawArrays(mode, 0, data.length / 8);
}

function resizeCanvas(): void {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.floor(canvas.clientWidth * ratio));
  const height = Math.max(1, Math.floor(canvas.clientHeight * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function compileShader(context: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = context.createShader(type);
  if (!shader) {
    throw new Error("Unable to create WebGL shader.");
  }
  context.shaderSource(shader, source);
  context.compileShader(shader);
  if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) {
    throw new Error(context.getShaderInfoLog(shader) ?? "Unknown WebGL shader error.");
  }
  return shader;
}

function createWebGlContext(target: HTMLCanvasElement): WebGLRenderingContext {
  const context = target.getContext("webgl", { antialias: true, alpha: false });
  if (!context) {
    throw new Error("WebGL is required for this particle fountain.");
  }
  return context;
}

function createProgram(
  context: WebGLRenderingContext,
  vertex: WebGLShader,
  fragment: WebGLShader
): WebGLProgram {
  const nextProgram = context.createProgram();
  if (!nextProgram) {
    throw new Error("Unable to create WebGL program.");
  }
  context.attachShader(nextProgram, vertex);
  context.attachShader(nextProgram, fragment);
  context.linkProgram(nextProgram);
  if (!context.getProgramParameter(nextProgram, context.LINK_STATUS)) {
    throw new Error(context.getProgramInfoLog(nextProgram) ?? "Unknown WebGL program error.");
  }
  return nextProgram;
}

function perspective(fov: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fov / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0
  ]);
}

function lookAt(eye: Vec3, target: Vec3, up: Vec3): Float32Array {
  const z = normalize([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);
  const x = normalize(cross(up, z));
  const y = cross(z, x);

  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1
  ]);
}

function multiplyMatrices(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      out[col * 4 + row] =
        a[0 * 4 + row] * b[col * 4 + 0] +
        a[1 * 4 + row] * b[col * 4 + 1] +
        a[2 * 4 + row] * b[col * 4 + 2] +
        a[3 * 4 + row] * b[col * 4 + 3];
    }
  }
  return out;
}

function normalize(value: Vec3): Vec3 {
  const length = Math.hypot(value[0], value[1], value[2]) || 1;
  return [value[0] / length, value[1] / length, value[2] / length];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
