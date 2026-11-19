/**
 * 5.7.0 — the canvas is created without MSAA when the frame goes through the HDR / post route.
 *
 * On that route the scene draws into the multisampled HDR target, and the only draws into the canvas (the default
 * framebuffer) are full-screen triangles. A full-screen triangle covers every sample of every pixel, and the fragment
 * shader runs once per pixel without sample shading, so all samples of a pixel receive the same value and the resolve
 * returns that value: a multisampled canvas produces the same bytes as a single-sampled one, and only costs GPU time.
 * The direct and legacy LDR routes draw geometry straight into the canvas and keep canvas MSAA.
 *
 * These tests pin (1) the decision and its fallbacks, and (2) on a recording device, that the HDR route's canvas draws
 * are all full-screen triangles while the direct route draws scene geometry into the canvas.
 */
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import type { RenderItem } from "../../../packages/rendering/src/ForwardPass";
import type { DrawCommand, MockRenderDevice, RenderTarget } from "../../../packages/rendering/src/RenderDevice";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial";
import { createTrustedQrFlags, type QrFlags } from "../../../packages/rendering/src/contracts/core";
import { withDirectPath } from "../../../packages/rendering/src/quality/DirectPath";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import "../../../packages/rendering/src/lanes/prd01";
import {
  CANVAS_WITHOUT_MSAA_REASON,
  canvasContextHasMsaa,
  canvasMsaaDirectPathBlockers,
  canvasMsaaForcedOn,
  recordCanvasContextMsaa,
  resolveAppRenderPath,
  resolveCanvasAntialias
} from "../../../packages/engine/src/agent-api/app/renderPath";
import type { AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types";

const HDR_FLAGS = createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_OUTPUT: true });
const LEGACY_LDR_FLAGS = createTrustedQrFlags({ A3D_QR_CORE: false, A3D_QR_CORE_OUTPUT: false });

afterEach(() => {
  delete (globalThis as { __A3D_CANVAS_MSAA__?: unknown }).__A3D_CANVAS_MSAA__;
});

const plainSnapshot = { schema: "aura3d-scene-snapshot/1.0", nodes: [{ kind: "primitive", primitive: "box", position: [0, 0, 0] }] } as unknown as AuraSceneSnapshot;
const bloomSnapshot = {
  schema: "aura3d-scene-snapshot/1.0",
  nodes: [{ kind: "primitive", primitive: "box", position: [0, 0, 0] }, { kind: "effect", effect: "bloom" }]
} as unknown as AuraSceneSnapshot;

describe("canvas antialias decision (resolveCanvasAntialias)", () => {
  it("is off on the HDR route and on for the direct and legacy LDR routes", () => {
    expect(resolveCanvasAntialias({}, HDR_FLAGS, "")).toBe(false);
    expect(resolveCanvasAntialias({}, withDirectPath(HDR_FLAGS), "")).toBe(true);
    expect(resolveCanvasAntialias({}, LEGACY_LDR_FLAGS, "")).toBe(true);
  });

  it("follows the route resolveAppRenderPath picks for a mount", () => {
    const flags = resolveQrFlags({ options: { A3D_QR_CORE: true } });
    const hdr = resolveAppRenderPath(bloomSnapshot, {}, flags, { search: "" });
    expect(hdr.direct).toBe(false);
    expect(resolveCanvasAntialias({}, hdr.flags, "")).toBe(false);
    const direct = resolveAppRenderPath(plainSnapshot, {}, flags, { search: "" });
    expect(direct.direct).toBe(true);
    expect(resolveCanvasAntialias({}, direct.flags, "")).toBe(true);
  });

  it("?canvasmsaa=on and __A3D_CANVAS_MSAA__ restore the pre-5.7.0 multisampled canvas", () => {
    expect(resolveCanvasAntialias({}, HDR_FLAGS, "?canvasmsaa=on")).toBe(true);
    (globalThis as { __A3D_CANVAS_MSAA__?: unknown }).__A3D_CANVAS_MSAA__ = "on";
    expect(canvasMsaaForcedOn("")).toBe(true);
    expect(resolveCanvasAntialias({}, HDR_FLAGS, "")).toBe(true);
    expect(canvasMsaaForcedOn("?canvasmsaa=auto")).toBe(false);
  });

  it("a canvas that already holds a context reports that context's attribute (context attributes are fixed per canvas)", () => {
    const hdrFirst = {};
    recordCanvasContextMsaa(hdrFirst, false);
    expect(resolveCanvasAntialias(hdrFirst, withDirectPath(HDR_FLAGS), "")).toBe(false);
    recordCanvasContextMsaa(hdrFirst, true); // first record wins, like the browser's context
    expect(canvasContextHasMsaa(hdrFirst)).toBe(false);
    const directFirst = {};
    recordCanvasContextMsaa(directFirst, true);
    expect(resolveCanvasAntialias(directFirst, HDR_FLAGS, "")).toBe(true);
    expect(canvasContextHasMsaa({})).toBeUndefined();
  });

  it("falls back safely: a later mount that would go direct on a canvas without MSAA stays on the HDR target", () => {
    const canvas = {};
    expect(canvasMsaaDirectPathBlockers(canvas)).toEqual([]);
    recordCanvasContextMsaa(canvas, false);
    expect(canvasMsaaDirectPathBlockers(canvas)).toEqual([CANVAS_WITHOUT_MSAA_REASON]);
    const flags = resolveQrFlags({ options: { A3D_QR_CORE: true } });
    const remount = resolveAppRenderPath(plainSnapshot, {}, flags, { search: "", extraBlockers: canvasMsaaDirectPathBlockers(canvas) });
    expect(remount.direct).toBe(false);
    expect(remount.report.path).toBe("hdr-msaa");
    expect(remount.report.reason).toContain(CANVAS_WITHOUT_MSAA_REASON);
  });

  it("the mount passes the decision to the renderer and records the created context", () => {
    const source = readFileSync("packages/engine/src/agent-api/compiler/renderer.ts", "utf8");
    expect(source).toContain("const canvasAntialias = resolveCanvasAntialias(canvas, flags);");
    expect(source).toContain("antialias: canvasAntialias,");
    expect(source).not.toMatch(/antialias: true,\n\s+\.\.\.\(requestedOutput/);
    expect(source).toContain("recordCanvasContextMsaa(canvas,");
    const loop = readFileSync("packages/engine/src/agent-api/app/frameLoop.ts", "utf8");
    expect(loop.match(/canvasMsaaDirectPathBlockers\(canvas\)/g)?.length).toBe(2);
  });
});

/** Every draw of one frame with the render target bound at draw time (null = the canvas). */
async function recordFrame(flags: QrFlags, postprocess?: Record<string, unknown>) {
  const renderer = await Renderer.create({ backend: "mock", width: 16, height: 16, qrFlags: flags });
  const device = renderer.device as MockRenderDevice;
  const draws: { command: DrawCommand; target: RenderTarget | null }[] = [];
  const draw = device.draw.bind(device);
  device.draw = (command: DrawCommand) => {
    draws.push({ command, target: device.getRenderTarget() });
    draw(command);
  };
  const item: RenderItem = { geometry: Geometry.box(), material: new UnlitMaterial({ name: "crate" }), label: "crate" } as RenderItem;
  try {
    renderer.render({ source: { cameraPolicy: "identity" as const, renderItems: [item], ...(postprocess ? { postprocess } : {}) }, frameId: 1 });
  } finally {
    renderer.dispose();
  }
  return draws;
}

/** Positions of a non-indexed draw, read back from the mock vertex buffer (float32 `position` attribute). */
function positions(command: DrawCommand): [number, number, number][] {
  const format = command.vertexFormat;
  const position = format?.attributes.find((attribute) => attribute.semantic === "position");
  if (!format || !position || (position.type ?? "float32") !== "float32") return [];
  const bytes = (command.vertexBuffer as unknown as { bytes: Uint8Array }).bytes;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const first = command.firstVertex ?? 0;
  return Array.from({ length: command.vertexCount }, (_, i) => {
    const at = (first + i) * format.stride + position.offset;
    return [view.getFloat32(at, true), view.getFloat32(at + 4, true), position.components > 2 ? view.getFloat32(at + 8, true) : 0];
  });
}

/**
 * The (-1,-1), (3,-1), (-1,3) triangle contains the whole clip square [-1,1]², so every sample of every pixel is covered by
 * the one primitive: per-sample values are equal, and the MSAA resolve returns exactly the single-sample value.
 */
function isFullscreenTriangle(command: DrawCommand): boolean {
  if (command.topology !== "triangles" || command.indexBuffer || command.vertexCount !== 3 || (command.instanceCount ?? 1) !== 1) return false;
  const p = positions(command).map(([x, y]) => `${x},${y}`).sort();
  return p.join(" ") === ["-1,-1", "-1,3", "3,-1"].join(" ");
}

describe("what reaches the canvas on each route (recording device)", () => {
  it("HDR route without post: the scene draws offscreen and the canvas only gets the full-screen OutputPass triangle", async () => {
    const draws = await recordFrame(HDR_FLAGS);
    const scene = draws.filter(({ command }) => command.label === "crate");
    expect(scene.length).toBeGreaterThan(0);
    expect(scene.every(({ target }) => target !== null)).toBe(true);
    const canvas = draws.filter(({ target }) => target === null);
    expect(canvas.length).toBeGreaterThan(0);
    for (const { command } of canvas) expect(isFullscreenTriangle(command), command.label).toBe(true);
  });

  it("direct route: the scene draws straight into the canvas, so the canvas keeps MSAA", async () => {
    const draws = await recordFrame(withDirectPath(HDR_FLAGS));
    const scene = draws.filter(({ command }) => command.label === "crate");
    expect(scene.length).toBeGreaterThan(0);
    expect(scene.every(({ target }) => target === null)).toBe(true);
    expect(resolveCanvasAntialias({}, withDirectPath(HDR_FLAGS), "")).toBe(true);
  });
});
