/**
 * Per-instance frustum culling (packages/rendering/src/renderer/InstanceFrustumCull.ts): conservative (never culls an instance whose
 * geometry can reach the screen), order-preserving, colours stay in sync, and the forward pass submits only the survivors.
 */
import { describe, expect, it } from "vitest";
import { ForwardPass, Geometry, MockRenderDevice } from "../../../packages/rendering/src";
import { cullInstancesToFrustum, MIN_CULLED_INSTANCES } from "../../../packages/rendering/src/renderer/InstanceFrustumCull";

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/** Column-major perspective * lookAt(eye -> target), GL clip space. */
function viewProjection(eye: number[], target: number[], fovY: number, aspect: number, near: number, far: number): number[] {
  const f = 1 / Math.tan(fovY / 2);
  const proj = [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0];
  const zx = eye[0]! - target[0]!, zy = eye[1]! - target[1]!, zz = eye[2]! - target[2]!;
  const zl = Math.hypot(zx, zy, zz);
  const z = [zx / zl, zy / zl, zz / zl];
  const xr = [0 * z[2]! - 1 * z[1]! * 0, 0, 0];
  // x = up(0,1,0) x z
  xr[0] = 1 * z[2]! - 0 * z[1]!; xr[1] = 0 * z[0]! - 0 * z[2]!; xr[2] = 0 * z[1]! - 1 * z[0]!;
  const xl = Math.hypot(xr[0]!, xr[1]!, xr[2]!);
  const x = [xr[0]! / xl, xr[1]! / xl, xr[2]! / xl];
  const y = [z[1]! * x[2]! - z[2]! * x[1]!, z[2]! * x[0]! - z[0]! * x[2]!, z[0]! * x[1]! - z[1]! * x[0]!];
  const view = [
    x[0]!, y[0]!, z[0]!, 0,
    x[1]!, y[1]!, z[1]!, 0,
    x[2]!, y[2]!, z[2]!, 0,
    -(x[0]! * eye[0]! + x[1]! * eye[1]! + x[2]! * eye[2]!), -(y[0]! * eye[0]! + y[1]! * eye[1]! + y[2]! * eye[2]!), -(z[0]! * eye[0]! + z[1]! * eye[1]! + z[2]! * eye[2]!), 1
  ];
  const out = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c += 1) for (let r = 0; r < 4; r += 1) {
    for (let k = 0; k < 4; k += 1) out[c * 4 + r]! += proj[k * 4 + r]! * view[c * 4 + k]!;
  }
  return out;
}

function transformsAround(count: number, spread: number, seed: number): Float32Array {
  const rand = lcg(seed);
  const m = new Float32Array(count * 16);
  for (let i = 0; i < count; i += 1) {
    const s = 0.5 + rand();
    const yaw = rand() * 6.28;
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    m.set([c * s, 0, -sn * s, 0, 0, s, 0, 0, sn * s, 0, c * s, 0, (rand() - 0.5) * spread, (rand() - 0.5) * 4, (rand() - 0.5) * spread, 1], i * 16);
  }
  return m;
}

const BOUNDS = { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] } as const;

/** Exact test: do any of the instance's eight transformed bounds corners land inside the clip volume? */
function cornersTouchFrustum(vp: number[], matrices: Float32Array, index: number): boolean {
  const o = index * 16;
  // Count corners outside each clip plane; an instance can be dropped only if all eight are outside the same plane.
  const outside = new Array<number>(6).fill(0);
  for (let corner = 0; corner < 8; corner += 1) {
    const lx = corner & 1 ? 0.5 : -0.5, ly = corner & 2 ? 0.5 : -0.5, lz = corner & 4 ? 0.5 : -0.5;
    const wx = matrices[o]! * lx + matrices[o + 4]! * ly + matrices[o + 8]! * lz + matrices[o + 12]!;
    const wy = matrices[o + 1]! * lx + matrices[o + 5]! * ly + matrices[o + 9]! * lz + matrices[o + 13]!;
    const wz = matrices[o + 2]! * lx + matrices[o + 6]! * ly + matrices[o + 10]! * lz + matrices[o + 14]!;
    const cx = vp[0]! * wx + vp[4]! * wy + vp[8]! * wz + vp[12]!;
    const cy = vp[1]! * wx + vp[5]! * wy + vp[9]! * wz + vp[13]!;
    const cz = vp[2]! * wx + vp[6]! * wy + vp[10]! * wz + vp[14]!;
    const cw = vp[3]! * wx + vp[7]! * wy + vp[11]! * wz + vp[15]!;
    if (cx < -cw) outside[0]!++;
    if (cx > cw) outside[1]!++;
    if (cy < -cw) outside[2]!++;
    if (cy > cw) outside[3]!++;
    if (cz < -cw) outside[4]!++;
    if (cz > cw) outside[5]!++;
  }
  return outside.every((n) => n < 8);
}

describe("cullInstancesToFrustum", () => {
  const vp = viewProjection([0, 9, 34], [0, 3, 0], (50 * Math.PI) / 180, 16 / 9, 0.1, 400);

  it("is conservative: every instance whose box touches the frustum is kept, order and colours stay in sync", () => {
    const count = 4000;
    const matrices = transformsAround(count, 160, 11);
    const colors = new Float32Array(count * 4);
    for (let i = 0; i < count; i += 1) colors.set([i / count, (i * 7 % 100) / 100, 0.25, 1], i * 4);
    const result = cullInstancesToFrustum({ viewProjection: vp, bounds: BOUNDS, transforms: matrices, colors });
    expect(result).not.toBeNull();
    expect(result!.total).toBe(count);
    expect(result!.count).toBeGreaterThan(0);
    expect(result!.count).toBeLessThan(count);
    const kept = new Set<number>();
    let cursor = 0;
    for (let k = 0; k < result!.count; k += 1) {
      // Find the original index by matching the matrix (order preserved => monotone scan).
      while (cursor < count && !matrices.subarray(cursor * 16, cursor * 16 + 16).every((v, j) => v === result!.transforms[k * 16 + j])) cursor += 1;
      expect(cursor).toBeLessThan(count);
      kept.add(cursor);
      expect(Array.from(result!.colors!.subarray(k * 4, k * 4 + 4))).toEqual(Array.from(colors.subarray(cursor * 4, cursor * 4 + 4)));
      cursor += 1;
    }
    for (let i = 0; i < count; i += 1) {
      if (cornersTouchFrustum(vp, matrices, i)) expect(kept.has(i), `instance ${i} reaches the screen but was culled`).toBe(true);
    }
    // And it earns its keep: the scene is 160 m wide with the camera inside it, so a large share is out of view.
    expect(result!.count).toBeLessThan(count * 0.75);
  });

  it("returns null when everything is visible, below the size threshold, or the matrix is unusable", () => {
    const few = transformsAround(MIN_CULLED_INSTANCES - 1, 160, 3);
    expect(cullInstancesToFrustum({ viewProjection: vp, bounds: BOUNDS, transforms: few })).toBeNull();
    const near = transformsAround(2000, 6, 5);
    near.forEach((_, i) => { if (i % 16 === 14) near[i] = 0; });
    expect(cullInstancesToFrustum({ viewProjection: viewProjection([0, 0, 20], [0, 0, 0], 1.5, 1, 0.1, 100), bounds: BOUNDS, transforms: near })).toBeNull();
    const bad = vp.slice();
    bad[3] = Number.NaN;
    expect(cullInstancesToFrustum({ viewProjection: bad, bounds: BOUNDS, transforms: transformsAround(2000, 160, 7) })).toBeNull();
  });

  it("reports count 0 when the whole set is behind the camera", () => {
    const m = transformsAround(1000, 20, 9);
    for (let i = 0; i < 1000; i += 1) m[i * 16 + 14] = 200 + (i % 7); // far behind a camera that looks toward -z from z = 34
    const result = cullInstancesToFrustum({ viewProjection: vp, bounds: BOUNDS, transforms: m });
    expect(result?.count).toBe(0);
  });

  it("uses the model matrix: a translated model moves instances in or out of view", () => {
    const m = transformsAround(1000, 20, 13);
    const away = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 500, 1]);
    expect(cullInstancesToFrustum({ viewProjection: vp, bounds: BOUNDS, transforms: m, modelMatrix: away })?.count).toBe(0);
  });
});

describe("ForwardPass instance culling", () => {
  const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const vp = new Float32Array(viewProjection([0, 9, 34], [0, 3, 0], (50 * Math.PI) / 180, 16 / 9, 0.1, 400));

  const draw = (options: { frustumCulled?: boolean; withViewProjection?: boolean }) => {
    const device = new MockRenderDevice();
    device.beginFrame(64, 36);
    const transforms = transformsAround(3000, 160, 21);
    new ForwardPass({
      ...(options.withViewProjection === false ? {} : { cameraViewProjectionMatrix: vp }),
      items: [{ geometry: Geometry.triangle(), modelMatrix: identity, label: "forest", instanceTransforms: transforms, ...(options.frustumCulled === false ? { frustumCulled: false } : {}) }]
    }).execute({ device, width: 64, height: 36 });
    device.endFrame();
    return device.drawCommands.filter((command) => command.label?.startsWith("forest"));
  };

  it("submits only the visible instances and still issues a single draw", () => {
    const commands = draw({});
    expect(commands.length).toBeGreaterThan(0);
    const submitted = commands.reduce((sum, command) => sum + (command.instanceCount ?? 1), 0);
    expect(submitted).toBeLessThan(3000);
    expect(submitted).toBeGreaterThan(0);
  });

  it("draws every instance when the item opts out or the pass has no view-projection", () => {
    for (const options of [{ frustumCulled: false }, { withViewProjection: false }]) {
      const commands = draw(options);
      const submitted = commands.reduce((sum, command) => sum + (command.instanceCount ?? 1), 0);
      expect(submitted).toBe(3000);
    }
  });
});
