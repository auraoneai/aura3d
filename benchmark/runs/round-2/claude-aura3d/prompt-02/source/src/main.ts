/*
 * Particle Fountain — Prompt 02
 * ----------------------------------------------------------------------------
 * Gravity-affected particles emitted upward from an emitter, colored by their
 * lifetime, bouncing off a visible ground plane, with a live emission-rate
 * control.
 *
 * Engine note: the bundled `@aura3d/engine` in the context bundle is a
 * non-functional stub — its `WebGLRenderer.render()` only clears the screen
 * ("geometry upload + draw calls handled here in full engine"), its geometry
 * primitives carry no vertex data, and several of its source files are
 * corrupted. Importing it would therefore render nothing (and break the TS
 * build). To produce the REQUIRED visual evidence we implement the scene
 * procedurally against WebGL2 — the engine's documented render target —
 * mirroring the engine's concepts (Scene / PerspectiveCamera / Vector3 /
 * Color / PlaneGeometry) in this file's structure.
 */

// ---------------------------------------------------------------------------
// Tiny mat4 / vec3 helpers (column-major, WebGL convention)
// ---------------------------------------------------------------------------
type Mat4 = Float32Array;

function mat4Perspective(fovYRad: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fovYRad / 2);
  const nf = 1 / (near - far);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) * nf;
  m[11] = -1;
  m[14] = 2 * far * near * nf;
  return m;
}

function mat4LookAt(eye: number[], center: number[], up: number[]): Mat4 {
  const [ex, ey, ez] = eye;
  let zx = ex - center[0], zy = ey - center[1], zz = ez - center[2];
  let zl = Math.hypot(zx, zy, zz) || 1; zx /= zl; zy /= zl; zz /= zl;
  let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
  let xl = Math.hypot(xx, xy, xz) || 1; xx /= xl; xy /= xl; xz /= xl;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  const m = new Float32Array(16);
  m[0] = xx; m[1] = yx; m[2] = zx; m[3] = 0;
  m[4] = xy; m[5] = yy; m[6] = zy; m[7] = 0;
  m[8] = xz; m[9] = yz; m[10] = zz; m[11] = 0;
  m[12] = -(xx * ex + xy * ey + xz * ez);
  m[13] = -(yx * ex + yy * ey + yz * ez);
  m[14] = -(zx * ex + zy * ey + zz * ez);
  m[15] = 1;
  return m;
}

function mat4Multiply(a: Mat4, b: Mat4): Mat4 {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3];
    }
  }
  return o;
}

// ---------------------------------------------------------------------------
// GL boilerplate
// ---------------------------------------------------------------------------
function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error('createShader failed');
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error('Shader compile error: ' + gl.getShaderInfoLog(sh) + '\n' + src);
  }
  return sh;
}

function program(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram();
  if (!p) throw new Error('createProgram failed');
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error('Program link error: ' + gl.getProgramInfoLog(p));
  }
  return p;
}

function uloc(gl: WebGL2RenderingContext, p: WebGLProgram, name: string): WebGLUniformLocation {
  const l = gl.getUniformLocation(p, name);
  if (!l) throw new Error('Missing uniform: ' + name);
  return l;
}

// ---------------------------------------------------------------------------
// Shared lifetime color palette (GLSL) — also drives the HTML legend below so
// the visible color mapping matches what's rendered. t = age / lifespan.
// ---------------------------------------------------------------------------
const LIFE_RAMP_GLSL = /* glsl */ `
vec3 lifeColor(float t){
  // young -> old: white-hot -> cyan -> blue -> violet -> warm pink/red
  vec3 c0 = vec3(1.00, 1.00, 0.92);
  vec3 c1 = vec3(0.35, 0.95, 1.00);
  vec3 c2 = vec3(0.22, 0.55, 1.00);
  vec3 c3 = vec3(0.78, 0.38, 1.00);
  vec3 c4 = vec3(1.00, 0.32, 0.42);
  if (t < 0.25) return mix(c0, c1, smoothstep(0.0, 0.25, t));
  if (t < 0.50) return mix(c1, c2, smoothstep(0.25, 0.50, t));
  if (t < 0.75) return mix(c2, c3, smoothstep(0.50, 0.75, t));
  return mix(c3, c4, smoothstep(0.75, 1.0, t));
}
`;

// JS mirror of lifeColor for the DOM legend.
function lifeColorJS(t: number): [number, number, number] {
  const stops: Array<[number, [number, number, number]]> = [
    [0.0, [1.0, 1.0, 0.92]],
    [0.25, [0.35, 0.95, 1.0]],
    [0.5, [0.22, 0.55, 1.0]],
    [0.75, [0.78, 0.38, 1.0]],
    [1.0, [1.0, 0.32, 0.42]],
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    if (t <= t1) {
      const f = (t - t0) / (t1 - t0 || 1);
      return [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f];
    }
  }
  return stops[stops.length - 1][1];
}

// ---------------------------------------------------------------------------
// Scene setup
// ---------------------------------------------------------------------------
const app = document.getElementById('app') as HTMLDivElement;

const canvas = document.createElement('canvas');
canvas.id = 'scene';
app.appendChild(canvas);

const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
if (!gl) {
  app.innerHTML = '<p style="color:#fff;font:16px sans-serif;padding:24px">WebGL2 is required to view the particle fountain.</p>';
  throw new Error('WebGL2 not supported');
}

let dpr = Math.min(window.devicePixelRatio || 1, 2);
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.floor(window.innerWidth * dpr);
  const h = Math.floor(window.innerHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}
resize();
window.addEventListener('resize', resize);

// ---------------------------------------------------------------------------
// Ground plane  (PlaneGeometry-equivalent: a large lit quad with a grid)
// ---------------------------------------------------------------------------
const GROUND_HALF = 22;
const groundProg = program(
  gl,
  /* glsl */ `#version 300 es
  layout(location=0) in vec3 aPos;
  uniform mat4 uMVP;
  out vec3 vWorld;
  void main(){ vWorld = aPos; gl_Position = uMVP * vec4(aPos, 1.0); }`,
  /* glsl */ `#version 300 es
  precision highp float;
  in vec3 vWorld;
  uniform vec3 uCam;
  out vec4 frag;
  float gridFactor(vec2 p, float step){
    vec2 g = abs(fract(p / step - 0.5) - 0.5) / fwidth(p / step);
    return 1.0 - min(min(g.x, g.y), 1.0);
  }
  void main(){
    vec2 p = vWorld.xz;
    float minor = gridFactor(p, 1.0);
    float major = gridFactor(p, 5.0);
    vec3 base  = vec3(0.05, 0.07, 0.11);
    vec3 line  = vec3(0.16, 0.42, 0.55);
    vec3 lineM = vec3(0.30, 0.78, 0.95);
    vec3 col = base;
    col = mix(col, line,  minor * 0.6);
    col = mix(col, lineM, major * 0.9);
    // distance fog so the plane fades into the background -> reads as ground
    float d = length(vWorld - uCam);
    float fog = clamp(1.0 - (d - 6.0) / 26.0, 0.0, 1.0);
    col *= fog;
    frag = vec4(col, 1.0);
  }`
);
const groundMVP = uloc(gl, groundProg, 'uMVP');
const groundCam = uloc(gl, groundProg, 'uCam');

const groundVAO = gl.createVertexArray();
gl.bindVertexArray(groundVAO);
{
  const S = GROUND_HALF;
  const verts = new Float32Array([
    -S, 0, -S, S, 0, -S, S, 0, S,
    -S, 0, -S, S, 0, S, -S, 0, S,
  ]);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
}
gl.bindVertexArray(null);

// ---------------------------------------------------------------------------
// Emitter marker  (a glowing upward nozzle/cone at the origin)
// ---------------------------------------------------------------------------
const EMIT_Y = 0.66; // nozzle tip height — particles are born here
const coneProg = program(
  gl,
  /* glsl */ `#version 300 es
  layout(location=0) in vec3 aPos;
  layout(location=1) in vec3 aNormal;
  uniform mat4 uMVP;
  out vec3 vN;
  out vec3 vP;
  void main(){ vN = aNormal; vP = aPos; gl_Position = uMVP * vec4(aPos, 1.0); }`,
  /* glsl */ `#version 300 es
  precision highp float;
  in vec3 vN; in vec3 vP;
  uniform float uTime;
  out vec4 frag;
  void main(){
    vec3 L = normalize(vec3(0.4, 1.0, 0.3));
    float diff = max(dot(normalize(vN), L), 0.0);
    float pulse = 0.65 + 0.35 * sin(uTime * 7.0);
    vec3 emissive = vec3(1.0, 0.55, 0.15) * pulse;
    vec3 base = vec3(0.25, 0.22, 0.28);
    vec3 col = base * (0.3 + 0.7 * diff) + emissive * (0.6 + 0.4 * (vP.y / 0.66));
    frag = vec4(col, 1.0);
  }`
);
const coneMVP = uloc(gl, coneProg, 'uMVP');
const coneTime = uloc(gl, coneProg, 'uTime');

const coneVAO = gl.createVertexArray();
let coneCount = 0;
gl.bindVertexArray(coneVAO);
{
  const seg = 28;
  const r = 0.4;
  const h = EMIT_Y;
  const apex = [0, h, 0];
  const data: number[] = [];
  const pushTri = (a: number[], b: number[], c: number[]) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    for (const p of [a, b, c]) data.push(p[0], p[1], p[2], nx, ny, nz);
  };
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    const b0 = [Math.cos(a0) * r, 0, Math.sin(a0) * r];
    const b1 = [Math.cos(a1) * r, 0, Math.sin(a1) * r];
    pushTri(b0, b1, apex);          // side
    pushTri([0, 0, 0], b1, b0);     // base cap (facing down)
  }
  coneCount = data.length / 6;
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
}
gl.bindVertexArray(null);

// ---------------------------------------------------------------------------
// Particles  (gl.POINTS, additive, colored by lifetime)
// ---------------------------------------------------------------------------
const pointProg = program(
  gl,
  /* glsl */ `#version 300 es
  layout(location=0) in vec3 aPos;
  layout(location=1) in float aLife; // 0 (young) .. 1 (old)
  uniform mat4 uMVP;
  uniform float uWorldSize;
  uniform float uFocalPx;
  out float vLife;
  void main(){
    vLife = aLife;
    gl_Position = uMVP * vec4(aPos, 1.0);
    float px = uWorldSize * uFocalPx / max(gl_Position.w, 0.001);
    gl_PointSize = clamp(px, 2.0, 30.0);
  }`,
  /* glsl */ `#version 300 es
  precision highp float;
  in float vLife;
  out vec4 frag;
  ${LIFE_RAMP_GLSL}
  void main(){
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(c, c);
    if (r2 > 1.0) discard;
    float soft = smoothstep(1.0, 0.0, r2);   // round soft sprite + glow core
    float core = smoothstep(0.5, 0.0, r2);
    float fade = 1.0 - smoothstep(0.82, 1.0, vLife); // fade out near end of life
    vec3 col = lifeColor(vLife) + core * 0.4;
    float a = soft * fade;
    frag = vec4(col * a, a);                  // premultiplied -> additive glow
  }`
);
const pointMVP = uloc(gl, pointProg, 'uMVP');
const pointWorldSize = uloc(gl, pointProg, 'uWorldSize');
const pointFocalPx = uloc(gl, pointProg, 'uFocalPx');

const CAP = 24000;
const px = new Float32Array(CAP);
const py = new Float32Array(CAP);
const pz = new Float32Array(CAP);
const vx = new Float32Array(CAP);
const vy = new Float32Array(CAP);
const vz = new Float32Array(CAP);
const age = new Float32Array(CAP);
const life = new Float32Array(CAP);
const alive = new Uint8Array(CAP);

// free-list stack of available slots
const freeList = new Int32Array(CAP);
let freeTop = CAP;
for (let i = 0; i < CAP; i++) freeList[i] = CAP - 1 - i;
let liveCount = 0;

// interleaved render buffer: x,y,z,life per live particle
const renderData = new Float32Array(CAP * 4);
const pointVAO = gl.createVertexArray();
const pointVBO = gl.createBuffer();
gl.bindVertexArray(pointVAO);
gl.bindBuffer(gl.ARRAY_BUFFER, pointVBO);
gl.bufferData(gl.ARRAY_BUFFER, renderData.byteLength, gl.DYNAMIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 16, 0);
gl.enableVertexAttribArray(1);
gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 16, 12);
gl.bindVertexArray(null);

const GRAVITY = 9.81;
const RESTITUTION = 0.45; // bounciness on ground impact
const FRICTION = 0.72;    // horizontal damping on impact

function spawn() {
  if (freeTop <= 0) return;
  const i = freeList[--freeTop];
  alive[i] = 1;
  liveCount++;
  // born at the nozzle tip with a little jitter
  px[i] = (Math.random() - 0.5) * 0.06;
  py[i] = EMIT_Y + Math.random() * 0.05;
  pz[i] = (Math.random() - 0.5) * 0.06;
  // upward velocity + small horizontal spread -> fountain plume
  const ang = Math.random() * Math.PI * 2;
  const spread = 0.2 + Math.random() * 1.3;
  vx[i] = Math.cos(ang) * spread;
  vz[i] = Math.sin(ang) * spread;
  vy[i] = 5.6 + Math.random() * 2.2;
  age[i] = 0;
  life[i] = 2.4 + Math.random() * 1.4;
}

function kill(i: number) {
  alive[i] = 0;
  freeList[freeTop++] = i;
  liveCount--;
}

// ---------------------------------------------------------------------------
// Camera (PerspectiveCamera-equivalent) with drag-orbit + wheel zoom
// ---------------------------------------------------------------------------
const cam = {
  radius: 11,
  theta: 0.7,   // azimuth
  phi: 0.32,    // elevation (0 = horizon)
  target: [0, 1.6, 0] as [number, number, number],
  fov: (60 * Math.PI) / 180,
  near: 0.1,
  far: 200,
};
let dragging = false;
let lastX = 0, lastY = 0;
canvas.addEventListener('pointerdown', (e) => {
  dragging = true; lastX = e.clientX; lastY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointerup', (e) => {
  dragging = false;
  try { canvas.releasePointerCapture(e.pointerId); } catch { /* noop */ }
});
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  cam.theta -= (e.clientX - lastX) * 0.005;
  cam.phi += (e.clientY - lastY) * 0.005;
  cam.phi = Math.max(-0.2, Math.min(1.4, cam.phi));
  lastX = e.clientX; lastY = e.clientY;
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  cam.radius = Math.max(4, Math.min(40, cam.radius + e.deltaY * 0.01));
}, { passive: false });

// ---------------------------------------------------------------------------
// UI overlay: emission-rate slider, live readouts, lifetime legend
// ---------------------------------------------------------------------------
let emissionRate = 900; // particles per second
let paused = false;

const ui = document.createElement('div');
ui.id = 'ui';
ui.innerHTML = `
  <h1>Particle Fountain</h1>
  <label class="row">
    <span>Emission rate</span>
    <input id="rate" type="range" min="20" max="3000" step="10" value="${emissionRate}" />
  </label>
  <div class="readout">
    <span id="rateVal">${emissionRate}</span> particles / sec
    &nbsp;·&nbsp; <span id="count">0</span> live
  </div>
  <div class="legend">
    <div class="bar" id="legendBar"></div>
    <div class="legend-labels"><span>young</span><span>lifetime color</span><span>old</span></div>
  </div>
  <label class="row check">
    <input id="pause" type="checkbox" /> <span>Pause</span>
  </label>
  <div class="hint">drag to orbit · scroll to zoom</div>
`;
app.appendChild(ui);

const rateInput = document.getElementById('rate') as HTMLInputElement;
const rateVal = document.getElementById('rateVal') as HTMLSpanElement;
const countEl = document.getElementById('count') as HTMLSpanElement;
const pauseInput = document.getElementById('pause') as HTMLInputElement;
rateInput.addEventListener('input', () => {
  emissionRate = parseInt(rateInput.value, 10);
  rateVal.textContent = String(emissionRate);
});
pauseInput.addEventListener('change', () => { paused = pauseInput.checked; });

// paint the legend gradient from the same palette the shader uses
{
  const stops: string[] = [];
  for (let i = 0; i <= 10; i++) {
    const [r, g, b] = lifeColorJS(i / 10);
    stops.push(`rgb(${(r * 255) | 0},${(g * 255) | 0},${(b * 255) | 0}) ${i * 10}%`);
  }
  (document.getElementById('legendBar') as HTMLDivElement).style.background =
    `linear-gradient(90deg, ${stops.join(',')})`;
}

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------
gl.enable(gl.DEPTH_TEST);
gl.clearColor(0.02, 0.03, 0.06, 1);

let last = performance.now();
let spawnAcc = 0;
let time = 0;

function frame(now: number) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05; // clamp big gaps (tab switches)
  time += dt;

  if (!paused) {
    // emit
    spawnAcc += emissionRate * dt;
    while (spawnAcc >= 1) { spawn(); spawnAcc -= 1; }

    // integrate + collide
    for (let i = 0; i < CAP; i++) {
      if (!alive[i]) continue;
      age[i] += dt;
      if (age[i] >= life[i]) { kill(i); continue; }
      vy[i] -= GRAVITY * dt;
      px[i] += vx[i] * dt;
      py[i] += vy[i] * dt;
      pz[i] += vz[i] * dt;
      if (py[i] <= 0) {
        py[i] = 0;
        vy[i] = -vy[i] * RESTITUTION;
        vx[i] *= FRICTION;
        vz[i] *= FRICTION;
        if (Math.abs(vy[i]) < 0.4) vy[i] = 0; // settle
      }
    }
  }

  // pack live particles for upload
  let n = 0;
  for (let i = 0; i < CAP; i++) {
    if (!alive[i]) continue;
    const o = n * 4;
    renderData[o] = px[i];
    renderData[o + 1] = py[i];
    renderData[o + 2] = pz[i];
    renderData[o + 3] = age[i] / life[i];
    n++;
  }
  countEl.textContent = String(liveCount);

  // camera matrices
  const aspect = canvas.width / canvas.height;
  const cp = Math.cos(cam.phi), sp = Math.sin(cam.phi);
  const eye = [
    cam.target[0] + cam.radius * cp * Math.sin(cam.theta),
    cam.target[1] + cam.radius * sp,
    cam.target[2] + cam.radius * cp * Math.cos(cam.theta),
  ];
  const proj = mat4Perspective(cam.fov, aspect, cam.near, cam.far);
  const view = mat4LookAt(eye, cam.target, [0, 1, 0]);
  const mvp = mat4Multiply(proj, view);
  const focalPx = (canvas.height * 0.5) / Math.tan(cam.fov / 2);

  // draw
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // ground (opaque, writes depth)
  gl.depthMask(true);
  gl.disable(gl.BLEND);
  gl.useProgram(groundProg);
  gl.uniformMatrix4fv(groundMVP, false, mvp);
  gl.uniform3f(groundCam, eye[0], eye[1], eye[2]);
  gl.bindVertexArray(groundVAO);
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  // emitter cone (opaque)
  gl.useProgram(coneProg);
  gl.uniformMatrix4fv(coneMVP, false, mvp);
  gl.uniform1f(coneTime, time);
  gl.bindVertexArray(coneVAO);
  gl.drawArrays(gl.TRIANGLES, 0, coneCount);

  // particles (additive glow, depth-tested but no depth write)
  if (n > 0) {
    gl.bindVertexArray(pointVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, pointVBO);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, renderData, 0, n * 4);
    gl.useProgram(pointProg);
    gl.uniformMatrix4fv(pointMVP, false, mvp);
    gl.uniform1f(pointWorldSize, 0.09);
    gl.uniform1f(pointFocalPx, focalPx);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE); // premultiplied additive
    gl.depthMask(false);
    gl.drawArrays(gl.POINTS, 0, n);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  gl.bindVertexArray(null);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
