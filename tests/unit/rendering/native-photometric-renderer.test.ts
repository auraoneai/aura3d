import { describe, expect, it } from "vitest";
import { Scene, identityMat4 } from "@aura3d/scene";
import "../../../packages/rendering/src/lanes/prd01";
import "../../../packages/rendering/src/lanes/prd02";
import "../../../packages/rendering/src/lanes/prd04";
import { collectLight, type CollectedLight } from "../../../packages/rendering/src/LightCollector";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { PBRMaterial } from "../../../packages/rendering/src/PBRMaterial";
import { MockRenderDevice, type DrawCommand, type RenderShaderProgram, type ShaderSources } from "../../../packages/rendering/src/RenderDevice";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { createDefaultShaderLibrary } from "../../../packages/rendering/src/ShaderLibrary";
import { TemporalHistory } from "../../../packages/rendering/src/TemporalHistory";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { registerShaderFeature } from "../../../packages/rendering/src/contracts/program";
import { registerForwardDrawHook } from "../../../packages/rendering/src/ForwardPass";
import type { PhotometricProfileIssue } from "../../../packages/rendering/src/lighting/PhotometricFrameResources";
import { TextureBudgetExceededError } from "../../../packages/rendering/src/textures/TextureBudget";

const flags = createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true });

class CaptureDevice extends MockRenderDevice {
  readonly sources = new Map<number, ShaderSources>();
  readonly submitted: { readonly label?: string; readonly source?: ShaderSources; readonly uniforms: Map<string, unknown>; readonly atlasLive: boolean }[] = [];
  override createShaderProgram(source: ShaderSources): RenderShaderProgram {
    const program = super.createShaderProgram(source);
    this.sources.set(program.id, source);
    return program;
  }
  override draw(command: DrawCommand): void {
    const uniforms = new Map<string, unknown>();
    for (const [name, value] of command.uniforms ?? []) uniforms.set(name, value instanceof Float32Array ? value.slice() : value);
    const atlas = uniforms.get("u_a3dPhotometricAtlas");
    this.submitted.push({ label: command.label, source: command.shader ? this.sources.get(command.shader.id) : undefined, uniforms,
      atlasLive: atlas instanceof TextureBinding && atlas.texture !== null && !atlas.texture.disposed });
    super.draw(command);
  }
}

function light(name: string, profile = false): CollectedLight {
  return {
    ...collectLight(new Scene().createLight("point", name)),
    position: [1, 2, 3], direction: [0, -1, 0], color: [1, 1, 1], intensity: profile ? 0 : 3,
    ...(profile ? { photometricProfile: { profile: { verticalAngles: [0, 90, 180], horizontalAngles: [0],
      candela: [100, 40, 0], symmetry: "rotational" as const }, scale: 2 }, photometricVisible: true, photometricDimmer: 0.25 } : {})
  };
}

function setup(enabled = true, callback?: (issue: PhotometricProfileIssue) => void, device = new CaptureDevice()) {
  const issues: PhotometricProfileIssue[] = [];
  const renderer = new Renderer(device, { width: 8, height: 8, shaderLibrary: createDefaultShaderLibrary(), qrFlags: flags,
    ...(enabled ? { photometricProfiles: { onUnsupported: callback ?? ((issue: PhotometricProfileIssue) => issues.push(issue)) } } : {}) }, new TemporalHistory());
  const geometry = Geometry.box();
  const material = new PBRMaterial();
  const item = { geometry, material, frustumCulled: false, label: "photometric-test-item" };
  return { device, renderer, geometry, material, item, issues, dispose: () => { geometry.dispose(); material.dispose(); renderer.dispose(); } };
}

describe("renderer photometric profile admission", () => {
  it("binds profile metadata to the exact selected lights for an opted-in view", () => {
    const run = setup();
    try {
      expect(run.renderer.photometricProfileAdmissionEnabled()).toBe(true);
      run.renderer.render({ renderItems: [run.item], collectedLights: [light("ordinary"), light("measured", true)] });
      const draw = run.device.submitted.find((entry) => entry.label === "photometric-test-item")!;
      expect(draw.source?.generatedProgram?.features.features["a3d.photometricProfile"]).toBe(true);
      expect(draw.atlasLive).toBe(true);
      expect(Array.from(draw.uniforms.get("u_a3dPhotometricOffsets") as Float32Array).slice(0, 8)).toEqual([0, 0, 0, 0, 0, 3, 4, 3]);
      expect(Array.from(draw.uniforms.get("u_a3dPhotometricMeta") as Float32Array).slice(0, 8)).toEqual([0, 0, 0, 0, 1, 0, 0.5, 0]);
      expect((draw.uniforms.get("u_lightData") as Float32Array)[27]).toBe(0);
      expect((draw.uniforms.get("u_a3dPhotometricAtlas") as TextureBinding).texture?.disposed).toBe(true);
      expect(run.issues).toEqual([]);
    } finally { run.dispose(); }
  });

  it("keeps default draws scalar and reports missing visibility before scalar fallback", () => {
    const ordinary = setup(false);
    const optedIn = setup();
    try {
      ordinary.renderer.render({ renderItems: [ordinary.item], collectedLights: [light("measured", true)] });
      expect(ordinary.renderer.photometricProfileAdmissionEnabled()).toBe(false);
      const ordinaryDraw = ordinary.device.submitted.find((entry) => entry.label === "photometric-test-item");
      expect(ordinaryDraw).toBeDefined();
      expect(ordinaryDraw?.source?.generatedProgram?.features.features["a3d.photometricProfile"]).toBeUndefined();
      const unavailable = { ...light("measured", true), photometricVisible: undefined };
      optedIn.renderer.render({ renderItems: [optedIn.item], collectedLights: [unavailable] });
      expect(optedIn.issues).toEqual([expect.objectContaining({ reason: "visibility-unavailable", viewId: "single" })]);
      const fallback = optedIn.device.submitted.find((entry) => entry.label === "photometric-test-item");
      expect(fallback).toBeDefined();
      expect(fallback?.source?.generatedProgram?.features.features["a3d.photometricProfile"]).toBeUndefined();
    } finally { ordinary.dispose(); optedIn.dispose(); }
  });

  it("lets a strict app reject an unsupported view before its draw", () => {
    const run = setup(true, (issue) => { throw new Error(`strict:${issue.reason}`); });
    try {
      const unavailable = { ...light("measured", true), photometricVisible: undefined };
      expect(() => run.renderer.render({ renderItems: [run.item], collectedLights: [unavailable] })).toThrow("strict:visibility-unavailable");
      expect(run.device.submitted).toHaveLength(0);
      expect(run.device.activeFrameToken).toBeNull();
    } finally { run.dispose(); }
  });

  it("keeps a hidden measured light enabled with zero effective scale", () => {
    const run = setup();
    try {
      const hidden = { ...light("measured", true), photometricVisible: false, photometricDimmer: 0 };
      run.renderer.render({ renderItems: [run.item], collectedLights: [hidden] });
      const draw = run.device.submitted.find((entry) => entry.label === "photometric-test-item")!;
      expect((draw.uniforms.get("u_a3dPhotometricOffsets") as Float32Array)[3]).toBe(3);
      expect((draw.uniforms.get("u_a3dPhotometricMeta") as Float32Array)[2]).toBe(0);
      expect(run.issues).toEqual([]);
    } finally { run.dispose(); }
  });

  it("reports clustered profile requests instead of dropping a zero-scalar profile", () => {
    const run = setup();
    try {
      const lights = [...Array.from({ length: 16 }, (_, index) => light(`ordinary-${index}`)), light("measured", true)];
      run.renderer.render({ renderItems: [run.item], collectedLights: lights });
      expect(run.issues).toEqual([expect.objectContaining({ reason: "clustered" })]);
      const fallback = run.device.submitted.find((entry) => entry.label === "photometric-test-item");
      expect(fallback).toBeDefined();
      expect(fallback?.source?.generatedProgram?.features.features["a3d.photometricProfile"]).toBeUndefined();
    } finally { run.dispose(); }
  });

  it("does not submit stale profiles after draw hooks mutate the source", () => {
    const run = setup();
    const measured = light("measured", true);
    const remove = registerForwardDrawHook({ id: "photometric-source-change", bind: () => {
      (measured.photometricProfile!.profile.candela as number[])[0] = 101;
    } });
    try {
      run.renderer.render({ renderItems: [run.item], collectedLights: [measured] });
      expect(run.issues).toEqual([expect.objectContaining({ reason: "draw-changed" })]);
      expect(run.device.submitted.filter((entry) => entry.label === "photometric-test-item")).toHaveLength(0);
    } finally { remove(); run.dispose(); }
  });

  it("applies the same view admission on the asynchronous frame route", async () => {
    const run = setup();
    try {
      await run.renderer.renderAsync({ renderItems: [run.item], collectedLights: [light("measured", true)] });
      const draw = run.device.submitted.find((entry) => entry.label === "photometric-test-item")!;
      expect(draw.source?.generatedProgram?.features.features["a3d.photometricProfile"]).toBe(true);
      expect(draw.atlasLive).toBe(true);
      expect(run.issues).toEqual([]);
    } finally { run.dispose(); }
  });

  it("reports a profile program failure before drawing a scalar variant", () => {
    class CompileFailureDevice extends CaptureDevice {
      profileCompiles = 0;
      override createShaderProgram(source: ShaderSources): RenderShaderProgram {
        if (source.generatedProgram?.features.features["a3d.photometricProfile"] === true) {
          this.profileCompiles += 1;
          throw new Error("profile program unavailable");
        }
        return super.createShaderProgram(source);
      }
    }
    const device = new CompileFailureDevice();
    const run = setup(true, undefined, device);
    try {
      run.renderer.render({ renderItems: [run.item], collectedLights: [light("measured", true)] });
      const draws = device.submitted.filter((entry) => entry.label === "photometric-test-item");
      expect(device.profileCompiles).toBe(1);
      expect(run.issues).toEqual([expect.objectContaining({ reason: "shader-unsupported" })]);
      expect(draws).toHaveLength(1);
      expect(draws[0]!.source?.generatedProgram?.features.features["a3d.photometricProfile"]).toBeUndefined();
      expect(draws[0]!.uniforms.has("u_a3dPhotometricAtlas")).toBe(false);
    } finally { run.dispose(); }
  });

  it("reports a direct-light hook conflict and draws the scalar program once", () => {
    const remove = registerShaderFeature({ id: "test.profile-direct-light-hook", owner: "prd04", flag: "A3D_QR_CORE",
      hooks: ["fragment:lights"], chunks: [], select: () => true, defines: () => ({}) });
    const run = setup();
    try {
      run.renderer.render({ renderItems: [run.item], collectedLights: [light("measured", true)] });
      const draws = run.device.submitted.filter((entry) => entry.label === "photometric-test-item");
      expect(run.issues).toEqual([expect.objectContaining({ reason: "shader-unsupported" })]);
      expect(draws).toHaveLength(1);
      expect(draws[0]!.source?.generatedProgram?.features.features["a3d.photometricProfile"]).toBeUndefined();
      expect(draws[0]!.source?.generatedProgram?.features.features["test.profile-direct-light-hook"]).toBe(true);
    } finally { remove(); run.dispose(); }
  });

  it("reports a texture budget failure and never replays a draw after device entry", () => {
    class BudgetFailureDevice extends CaptureDevice {
      profileAttempts = 0;
      override draw(command: DrawCommand): void {
        if (command.uniforms?.has("u_a3dPhotometricAtlas")) {
          this.profileAttempts += 1;
          throw new TextureBudgetExceededError("test atlas budget exhausted");
        }
        super.draw(command);
      }
    }
    const device = new BudgetFailureDevice();
    const run = setup(true, undefined, device);
    try {
      expect(() => run.renderer.render({ renderItems: [run.item], collectedLights: [light("measured", true)] })).toThrow("test atlas budget exhausted");
      expect(device.profileAttempts).toBe(1);
      expect(run.issues).toEqual([expect.objectContaining({ reason: "submission-failed" })]);
      expect(device.submitted.filter((entry) => entry.label === "photometric-test-item")).toHaveLength(0);
      expect(device.activeFrameToken).toBeNull();
    } finally { run.dispose(); }
  });

  it("keeps measured atlases isolated across views and reports the correct view on fallback", () => {
    const run = setup();
    const camera = { viewMatrix: identityMat4(), projectionMatrix: identityMat4() };
    const views = [
      { id: "left", camera, viewport: { x: 0, y: 0, width: 4, height: 8 } },
      { id: "right", camera, viewport: { x: 4, y: 0, width: 4, height: 8 } },
    ];
    try {
      run.renderer.render({ source: { cameraPolicy: "identity", renderItems: [run.item], collectedLights: [light("measured", true)] }, views });
      const draws = run.device.submitted.filter((entry) => entry.label === "photometric-test-item");
      expect(draws).toHaveLength(2);
      const first = (draws[0]!.uniforms.get("u_a3dPhotometricAtlas") as TextureBinding).texture;
      const second = (draws[1]!.uniforms.get("u_a3dPhotometricAtlas") as TextureBinding).texture;
      expect(draws.every((entry) => entry.atlasLive)).toBe(true);
      expect(first).not.toBe(second);
      expect(first?.disposed).toBe(true);
      expect(second?.disposed).toBe(true);
      const missing = { ...light("missing", true), photometricVisible: undefined };
      run.renderer.render({ source: { cameraPolicy: "identity", renderItems: [run.item], collectedLights: [missing] }, views });
      expect(run.issues.map((issue) => issue.viewId)).toEqual(["view:string:left", "view:string:right"]);
      expect(run.issues.every((issue) => issue.reason === "visibility-unavailable")).toBe(true);
    } finally { run.dispose(); }
  });

  it("owns probe-face atlas resources and diagnostics without a contributor frame context", () => {
    const run = setup();
    const target = run.device.createRenderTarget({ width: 8, height: 8, format: "rgba8", depth: false });
    try {
      const source = { renderItems: [run.item], collectedLights: [light("measured", true)] };
      run.renderer.renderProbeFace(source, 0, target, identityMat4());
      const draw = run.device.submitted.find((entry) => entry.label === "photometric-test-item")!;
      expect(draw.atlasLive).toBe(true);
      expect(draw.source?.generatedProgram?.features.features["a3d.photometricProfile"]).toBe(true);
      expect((draw.uniforms.get("u_a3dPhotometricAtlas") as TextureBinding).texture?.disposed).toBe(true);
      const missing = { ...light("missing", true), photometricVisible: undefined };
      run.renderer.renderProbeFace({ ...source, collectedLights: [missing] }, 1, target, identityMat4());
      expect(run.issues).toEqual([expect.objectContaining({ reason: "visibility-unavailable", viewId: "probe:1" })]);
    } finally { target.dispose(); run.dispose(); }
  });

  it("isolates admissions and lifetimes for two renderers sharing a device", () => {
    const device = new CaptureDevice();
    const first = setup(true, undefined, device);
    const second = setup(true, undefined, device);
    first.item.label = "first-profile-item";
    second.item.label = "second-profile-item";
    try {
      first.renderer.render({ renderItems: [first.item], collectedLights: [light("first", true)] });
      const missing = { ...light("second", true), photometricVisible: undefined };
      second.renderer.render({ renderItems: [second.item], collectedLights: [missing] });
      expect(first.issues).toEqual([]);
      expect(second.issues).toEqual([expect.objectContaining({ reason: "visibility-unavailable" })]);
      const firstDraw = device.submitted.find((entry) => entry.label === "first-profile-item")!;
      const secondDraw = device.submitted.find((entry) => entry.label === "second-profile-item")!;
      expect(firstDraw.atlasLive).toBe(true);
      expect(firstDraw.source?.generatedProgram?.features.features["a3d.photometricProfile"]).toBe(true);
      expect(secondDraw.source?.generatedProgram?.features.features["a3d.photometricProfile"]).toBeUndefined();
      second.dispose();
      expect(device.disposed).toBe(false);
      first.renderer.render({ renderItems: [first.item], collectedLights: [light("first", true)] });
      expect(device.submitted.filter((entry) => entry.label === "first-profile-item")).toHaveLength(2);
    } finally { second.dispose(); first.dispose(); }
  });
});
