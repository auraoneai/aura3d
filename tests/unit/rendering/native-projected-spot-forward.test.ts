import { describe, expect, it, vi } from "vitest";
import { Scene } from "@aura3d/scene";
import "../../../packages/rendering/src/lanes/prd01";
import "../../../packages/rendering/src/lanes/prd02";
import "../../../packages/rendering/src/lanes/prd04";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { collectLight, type CollectedLight } from "../../../packages/rendering/src/LightCollector";
import { PBRMaterial } from "../../../packages/rendering/src/PBRMaterial";
import { MockRenderDevice, type DrawCommand, type RenderShaderProgram, type ShaderSources } from "../../../packages/rendering/src/RenderDevice";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { createDefaultShaderLibrary } from "../../../packages/rendering/src/ShaderLibrary";
import { TemporalHistory } from "../../../packages/rendering/src/TemporalHistory";
import { Texture } from "../../../packages/rendering/src/Texture";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { registerShaderFeature } from "../../../packages/rendering/src/contracts/program";
import { registerForwardDrawHook, type ProjectedSpotIssue } from "../../../packages/rendering/src/ForwardPass";
import type { ProjectedSpotFrameIdentity, ProjectedSpotFrameLease, ProjectedSpotResource } from "../../../packages/rendering/src/lighting/ProjectedSpotBindings";
import type { VolumeRenderer } from "../../../packages/rendering/src/VolumeRenderer";
import type { FrameContributorContext } from "../../../packages/rendering/src/contracts/frameGraph";

// These tests execute renderer and shader-generation code with a mock device;
// they do not compile a GL program or establish projected pixels.
const nativeVolumeDraw = vi.hoisted(() => vi.fn());
vi.mock("../../../packages/rendering/src/webgl2/ScalarVolumeHost", () => ({ drawScalarVolumeOnWebGL2: nativeVolumeDraw }));

class CaptureDevice extends MockRenderDevice {
  readonly programs = new Map<number, ShaderSources>();
  readonly submitted: { readonly label?: string; readonly source?: ShaderSources; readonly uniforms: Map<string, unknown>; readonly imageLive: boolean }[] = [];
  readonly trace: string[] = [];
  failProjected = false;
  constructor(limit = 64) {
    super();
    Object.defineProperty(this, "kind", { value: "webgl2" });
    Object.defineProperty(this, "generation", { value: 1 });
    Object.defineProperty(this, "info", { value: { ...this.info, backend: "webgl2", maxFragmentTextureUnits: limit } });
    Object.assign(this, { onDeviceLost: () => () => {}, waitForSubmittedWork: async () => {}, supportsSubmittedWorkCompletion: () => true });
  }
  override createShaderProgram(source: ShaderSources): RenderShaderProgram {
    if (this.failProjected && source.generatedProgram?.features.features["a3d.projectedSpot"] === true) throw new Error("projected shader unavailable");
    const program = super.createShaderProgram(source);
    this.programs.set(program.id, source);
    return program;
  }
  override draw(command: DrawCommand): void {
    const uniforms = new Map<string, unknown>();
    for (const [name, value] of command.uniforms ?? []) uniforms.set(name, value instanceof Float32Array ? value.slice() : value);
    const image = uniforms.get("u_projectedSpotMap");
    this.submitted.push({ label: command.label, source: command.shader ? this.programs.get(command.shader.id) : undefined, uniforms,
      imageLive: image instanceof TextureBinding && image.texture !== null && !image.texture.disposed });
    this.trace.push(command.label ?? "draw");
    super.draw(command);
  }
}

function point(name: string, intensity: number): CollectedLight {
  return { ...collectLight(new Scene().createLight("point", name)), position: [1, 2, 3], direction: [0, -1, 0],
    color: [1, 1, 1], intensity, range: 10, spotAngle: 0, penumbra: 0, layerMask: 1, castsShadow: false };
}
function spot(asset: object): CollectedLight {
  return { ...point("projected", 4), kind: "spot", spotAngle: 0.6,
    projectedImage: { texture: asset, offset: [0.125, -0.25], scale: [2, 0.5], rotation: 0.75 } };
}
const identity = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

function setup(options: { enabled?: boolean; limit?: number; output?: boolean; photometric?: boolean } = {}) {
  const device = new CaptureDevice(options.limit);
  const asset = {};
  const texture = new Texture({ width: 2, height: 1, format: "rgba8", colorSpace: "linear", generateMipmaps: false, flipY: false,
    mipLevels: [{ width: 2, height: 1, data: Uint8Array.of(17, 41, 73, 255, 101, 131, 167, 63) }] });
  const issues: ProjectedSpotIssue[] = [];
  const profileIssues: Array<{ readonly reason: string }> = [];
  let owner: object;
  let current = true;
  let refuseReleases = 0;
  const releases: Array<{ readonly active: boolean; readonly accepted: boolean }> = [];
  const acquired: ProjectedSpotFrameLease[] = [];
  const resource: ProjectedSpotResource<unknown> = {
    matchesAsset(candidate) { return current && candidate === asset; },
    acquireFrame(frame: ProjectedSpotFrameIdentity) {
      const token = device.activeFrameToken;
      if (!current || frame.device !== device || frame.owner !== owner || !token) return undefined;
      const captured = { ...frame }, revision = texture.revision;
      let released = false;
      const lease: ProjectedSpotFrameLease = {
        texture,
        isCurrent(now) {
          return !released && current && !texture.disposed && texture.revision === revision && device.activeFrameToken === token &&
            now.device === captured.device && now.owner === captured.owner && now.viewId === captured.viewId && now.frameIndex === captured.frameIndex;
        },
        release() {
          if (released) return true;
          const active = !!device.activeFrameToken;
          const accepted = !active && refuseReleases-- <= 0;
          releases.push({ active, accepted });
          if (accepted) released = true;
          return accepted;
        }
      };
      acquired.push(lease);
      return lease;
    }
  };
  const flags = createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_QR_CORE_OUTPUT: options.output === true });
  const renderer = new Renderer(device, { width: 8, height: 8, shaderLibrary: createDefaultShaderLibrary(), qrFlags: flags,
    ...(options.enabled === false ? {} : { projectedSpotImages: { resolveResource: (candidate: unknown) => candidate === asset ? resource : undefined,
      onUnsupported: (issue: ProjectedSpotIssue) => issues.push(issue) } }),
    ...(options.photometric ? { photometricProfiles: { onUnsupported: (issue: { readonly reason: string }) => profileIssues.push(issue) } } : {})
  }, new TemporalHistory());
  owner = renderer.postScopeId();
  const geometry = Geometry.box();
  const material = new PBRMaterial();
  const item = { geometry, material, frustumCulled: false, label: "projected-mesh" };
  return { device, renderer, geometry, material, item, asset, texture, resource, acquired, releases, issues, profileIssues,
    invalidate() { current = false; }, refuseNextRelease() { refuseReleases = 1; },
    dispose() { geometry.dispose(); material.dispose(); renderer.dispose(); texture.dispose(); } };
}

describe("projected-spot forward integration", () => {
  it("keeps the default scalar variant unchanged without admission", () => {
    const f = setup({ enabled: false });
    try {
      f.renderer.render({ cameraPolicy: "identity", renderItems: [f.item], collectedLights: [spot(f.asset)] });
      const draw = f.device.submitted.find((entry) => entry.label === f.item.label)!;
      expect(f.renderer.projectedSpotImageAdmissionEnabled()).toBe(false);
      expect(draw.source?.generatedProgram?.features.features["a3d.projectedSpot"]).toBeUndefined();
      expect(draw.uniforms.has("u_projectedSpotMap")).toBe(false);
      expect(f.acquired).toHaveLength(0);
    } finally { f.dispose(); }
  });

  it("binds the selected spot and releases its shared frame lease after submission", () => {
    const f = setup();
    try {
      const lights = [point("ordinary", 3), spot(f.asset)];
      f.renderer.render({ cameraPolicy: "identity", renderItems: [f.item, { ...f.item, label: "second-mesh" }], collectedLights: lights });
      const draws = f.device.submitted.filter((entry) => entry.label === f.item.label || entry.label === "second-mesh");
      expect(draws).toHaveLength(2);
      for (const draw of draws) {
        expect(draw.source?.generatedProgram?.features.features["a3d.projectedSpot"]).toBe(true);
        expect(draw.source?.fragment).toContain("a3dProjectedSpotImage(u_projectedSpotMap");
        expect(draw.uniforms.get("u_projectedSpotIndex")).toBe(1);
        expect(draw.uniforms.get("u_projectedSpotOffset")).toEqual([0.125, -0.25]);
        expect(draw.uniforms.get("u_projectedSpotScale")).toEqual([2, 0.5]);
        expect((draw.uniforms.get("u_projectedSpotMap") as TextureBinding).texture).toBe(f.texture);
        expect(draw.imageLive).toBe(true);
      }
      expect(f.acquired).toHaveLength(1);
      expect(f.releases).toEqual([{ active: false, accepted: true }]);
      expect(f.issues).toEqual([]);
    } finally { f.dispose(); }
  });

  it("uses the same selected slot for projected and photometric modulation", () => {
    const f = setup({ photometric: true });
    try {
      const measured: CollectedLight = { ...spot(f.asset), photometricProfile: { profile: { verticalAngles: [0, 90, 180], horizontalAngles: [0],
        candela: [100, 40, 0], symmetry: "rotational" }, scale: 2 }, photometricVisible: true, photometricDimmer: 0.5 };
      f.renderer.render({ cameraPolicy: "identity", renderItems: [f.item], collectedLights: [point("ordinary", 3), measured] });
      const draw = f.device.submitted.find((entry) => entry.label === f.item.label)!;
      expect(draw.source?.generatedProgram?.features.features).toMatchObject({ "a3d.projectedSpot": true, "a3d.photometricProfile": true });
      expect(draw.uniforms.get("u_projectedSpotIndex")).toBe(1);
      expect(Array.from(draw.uniforms.get("u_a3dPhotometricOffsets") as Float32Array).slice(4, 8)).toEqual([0, 3, 4, 3]);
      expect((draw.uniforms.get("u_lightData") as Float32Array)[24 + 11]).toBe(2);
      expect(f.issues).toEqual([]); expect(f.profileIssues).toEqual([]);
    } finally { f.dispose(); }
  });

  it("skips a draw if a forward hook changes the image after admission", () => {
    const f = setup();
    const projected = spot(f.asset);
    const remove = registerForwardDrawHook({ id: "projected-test-mutation", bind: () => {
      (projected.projectedImage!.offset as number[])[0] = 0.75;
    } });
    try {
      f.renderer.render({ cameraPolicy: "identity", renderItems: [f.item], collectedLights: [projected] });
      expect(f.device.submitted.filter((entry) => entry.label === f.item.label)).toHaveLength(0);
      expect(f.issues).toContainEqual(expect.objectContaining({ reason: "draw-changed" }));
      expect(f.releases).toEqual([{ active: false, accepted: true }]);
    } finally { remove(); f.dispose(); }
  });

  it("reports missing resources and sampler capacity before using scalar lighting", () => {
    const missing = setup(), limited = setup({ limit: 0 });
    try {
      missing.renderer.render({ cameraPolicy: "identity", renderItems: [missing.item], collectedLights: [spot({})] });
      expect(missing.issues).toContainEqual(expect.objectContaining({ reason: "texture-unavailable" }));
      expect(missing.device.submitted.find((entry) => entry.label === missing.item.label)?.uniforms.has("u_projectedSpotMap")).toBe(false);
      limited.renderer.render({ cameraPolicy: "identity", renderItems: [limited.item], collectedLights: [spot(limited.asset)] });
      expect(limited.issues).toContainEqual(expect.objectContaining({ reason: "shader-contract" }));
      expect(limited.device.submitted.find((entry) => entry.label === limited.item.label)?.uniforms.has("u_projectedSpotMap")).toBe(false);
      expect(limited.releases).toEqual([{ active: false, accepted: true }]);
    } finally { missing.dispose(); limited.dispose(); }
  });

  it("reports a conflicting lighting hook and a shader failure without replaying a projected draw", () => {
    const remove = registerShaderFeature({ id: "test.projected-light-hook", owner: "prd04", flag: "A3D_QR_CORE",
      hooks: ["fragment:lights"], chunks: [], select: () => true, defines: () => ({}) });
    const conflict = setup();
    try {
      conflict.renderer.render({ cameraPolicy: "identity", renderItems: [conflict.item], collectedLights: [spot(conflict.asset)] });
      expect(conflict.issues).toContainEqual(expect.objectContaining({ reason: "shader-unsupported" }));
      const draws = conflict.device.submitted.filter((entry) => entry.label === conflict.item.label);
      expect(draws).toHaveLength(1);
      expect(draws[0]!.uniforms.has("u_projectedSpotMap")).toBe(false);
    } finally { remove(); conflict.dispose(); }
    const failure = setup();
    try {
      failure.device.failProjected = true;
      failure.renderer.render({ cameraPolicy: "identity", renderItems: [failure.item], collectedLights: [spot(failure.asset)] });
      expect(failure.issues).toContainEqual(expect.objectContaining({ reason: "shader-unsupported" }));
      expect(failure.device.submitted.filter((entry) => entry.label === failure.item.label)).toHaveLength(1);
    } finally { failure.dispose(); }
  });

  it("retries a lease that cannot release at the first frame boundary", () => {
    const f = setup();
    try {
      f.refuseNextRelease();
      const source = { cameraPolicy: "identity" as const, renderItems: [f.item], collectedLights: [spot(f.asset)] };
      f.renderer.render(source);
      expect(f.releases).toEqual([{ active: false, accepted: false }]);
      f.renderer.render(source);
      expect(f.releases.filter((entry) => entry.accepted)).toHaveLength(2);
      expect(f.releases.every((entry) => !entry.active)).toBe(true);
    } finally { f.dispose(); }
  });

  it.each([false, true])("retains volume depth/order and shares the light packet across transparent segments (async=%s)", async (asynchronous) => {
    nativeVolumeDraw.mockReset();
    const f = setup({ output: true });
    const transparent = new PBRMaterial({ renderState: { blend: true, depthWrite: false } });
    const volumeRenderer = { assertUsableForDevice: vi.fn() } as unknown as VolumeRenderer;
    const volumeLease = { assertCurrent: vi.fn(), release: vi.fn() };
    const volume = { renderer: volumeRenderer, frameLease: volumeLease, modelMatrix: identity(),
      worldBounds: { min: [-1, -1, -1] as const, max: [1, 1, 1] as const }, layerMask: 1,
      frustumCulled: false, renderOrder: 0, mode: { type: "slice" as const, axis: "z" as const, position: 0.5 } };
    nativeVolumeDraw.mockImplementation((_context: FrameContributorContext) => { f.device.trace.push("volume"); });
    const camera = { viewMatrix: identity(), projectionMatrix: identity(), viewProjectionMatrix: identity() };
    const source = { cameraPolicy: "require" as const, renderItems: [f.item,
      { ...f.item, material: transparent, label: "transparent-before", renderOrder: -1 },
      { ...f.item, material: transparent, label: "transparent-after", renderOrder: 1 }],
      collectedLights: [spot(f.asset)], scalarVolumes: [volume] };
    try {
      const input = { source, camera, frameId: 1 };
      if (asynchronous) await f.renderer.renderAsync(input); else f.renderer.render(input);
      const trace = f.device.trace;
      expect(trace.indexOf("prd01-scene-depth-copy")).toBeGreaterThanOrEqual(0);
      expect(trace.indexOf("transparent-before")).toBeGreaterThanOrEqual(0);
      expect(trace.indexOf("volume")).toBeGreaterThanOrEqual(0);
      expect(trace.indexOf("transparent-before")).toBeLessThan(trace.indexOf("volume"));
      expect(trace.indexOf("transparent-after")).toBeGreaterThan(trace.indexOf("volume"));
      expect(trace.indexOf("prd01-output")).toBeGreaterThan(trace.indexOf("volume"));
      expect(volumeLease.assertCurrent).toHaveBeenCalled();
      expect(f.acquired).toHaveLength(1);
      const draws = f.device.submitted.filter((entry) => ["projected-mesh", "transparent-before", "transparent-after"].includes(entry.label ?? ""));
      expect(draws).toHaveLength(3);
      expect(draws.every((entry) => entry.imageLive && entry.uniforms.get("u_projectedSpotIndex") === 0)).toBe(true);
      expect(f.releases).toEqual([{ active: false, accepted: true }]);
    } finally { transparent.dispose(); f.dispose(); }
  });
});
