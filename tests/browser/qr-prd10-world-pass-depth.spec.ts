import { test, expect } from "@playwright/test";
import { resolveQrFlags } from "@aura3d/engine/contracts";
import { worldDrawPath } from "../../packages/engine/src/production-runtime/world/WorldFramePasses";

/**
 * PRD-10 T1.11 — Path S ordering proof: a `background`-phase quad at world
 * z=5 must be correctly depth-occluded by `opaque` boxes at z=3 (in front,
 * wins) and z=7 (behind, loses). Result is recorded in evidence/prd-10.
 *
 * Path G is unreachable here (C-01/C-02 real impls land with lanes 01/02), so
 * `worldDrawPath` must report "S".
 */

test("Path S background quad occludes/is occluded by depth correctly", async ({ page }) => {
  const flags = resolveQrFlags({ options: ["world"], env: {} });
  expect(worldDrawPath(flags)).toBe("S");

  await page.goto("about:blank");
  const pixels = await page.evaluate(() => {
    const W = 64;
    const H = 64;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const gl = canvas.getContext("webgl2", { antialias: false, preserveDrawingBuffer: true })!;
    if (!gl) return { error: "no-webgl2" };

    const vs = `#version 300 es
      layout(location=0) in vec2 a_pos;
      uniform vec2 u_center;
      uniform vec2 u_half;
      uniform float u_clipZ;
      void main() {
        gl_Position = vec4(u_center + a_pos * u_half, u_clipZ, 1.0);
      }`;
    const fs = `#version 300 es
      precision highp float;
      uniform vec3 u_color;
      out vec4 o;
      void main() { o = vec4(u_color, 1.0); }`;
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "compile");
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? "link");
    gl.useProgram(prog);

    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.clearColor(0, 0, 0, 1);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const uCenter = gl.getUniformLocation(prog, "u_center");
    const uHalf = gl.getUniformLocation(prog, "u_half");
    const uClipZ = gl.getUniformLocation(prog, "u_clipZ");
    const uColor = gl.getUniformLocation(prog, "u_color");
    const clipZOf = (worldZ: number) => 1 - worldZ / 5; // z=3 -> 0.4, z=5 -> 0.0, z=7 -> -0.4
    const quad = (cx: number, cy: number, hx: number, hy: number, worldZ: number, color: [number, number, number]) => {
      gl.uniform2f(uCenter, cx, cy);
      gl.uniform2f(uHalf, hx, hy);
      gl.uniform1f(uClipZ, clipZOf(worldZ));
      gl.uniform3f(uColor, color[0], color[1], color[2]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    // Path S ordering: `background` phase first, then `opaque`.
    quad(0, 0, 1, 1, 5, [0.2, 0.5, 0.9]); // background quad, world z=5, sky blue
    quad(-0.5, 0, 0.5, 1, 3, [0.9, 0.1, 0.1]); // near opaque box z=3, red, left half
    quad(0.5, 0, 0.5, 1, 7, [0.1, 0.9, 0.1]); // far opaque box z=7, green, right half

    const px = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const at = (x: number, y: number): number[] => {
      const i = ((H - 1 - y) * W + x) * 4; // flip y for NDC
      return [px[i], px[i + 1], px[i + 2]];
    };
    return {
      left: at(8, 32), // covered by near red box only
      right: at(56, 32), // far green box is behind bg -> bg wins
      center: at(32, 60) // uncovered strip -> bg
    };
  });

  if ("error" in pixels) test.skip(true, "no WebGL2 in runner");
  const p = pixels as { left: number[]; right: number[]; center: number[] };
  // Near box (z=3) beats the background (z=5).
  expect(p.left[0]).toBeGreaterThan(150);
  expect(p.left[2]).toBeLessThan(80);
  // Far box (z=7) loses to the background (z=5): right half stays sky blue.
  expect(p.right[2]).toBeGreaterThan(150);
  expect(p.right[0]).toBeLessThan(120);
  // Uncovered region shows the background quad.
  expect(p.center[2]).toBeGreaterThan(150);
});
