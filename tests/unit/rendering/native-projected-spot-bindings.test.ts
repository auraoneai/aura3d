import { describe, expect, it, vi } from "vitest";
import { Scene } from "@aura3d/scene";
import { collectLight, type CollectedLight } from "../../../packages/rendering/src/LightCollector";
import { LightUniforms } from "../../../packages/rendering/src/LightUniforms";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { Texture } from "../../../packages/rendering/src/Texture";
import {
  buildProjectedSpotBindings,
  type ProjectedSpotBindings,
  type ProjectedSpotFrameIdentity,
  type ProjectedSpotFrameLease,
  type ProjectedSpotImage,
  type ProjectedSpotLight
} from "../../../packages/rendering/src/lighting/ProjectedSpotBindings";

type Asset = { readonly id: string };
type MutableImage = { texture: Asset; offset?: [number, number]; scale?: [number, number]; rotation?: number };
type Light = ProjectedSpotLight<Asset>;

function light(name: string, intensity: number, kind: "spot" | "point" = "point"): Light {
  // A fresh scene light carries no projected image; drop the untyped slot so the light is a Light<Asset>.
  const { projectedImage: _none, ...collected } = collectLight(new Scene().createLight(kind, name));
  return { ...collected, kind, color: [1, 1, 1], intensity,
    position: [1, 2, 3], direction: [0, -1, 0], right: [1, 0, 0], up: [0, 0, 1], range: 10,
    spotAngle: kind === "spot" ? 0.6 : 0, penumbra: 0.1, castsShadow: false, layerMask: 1 };
}

function texture(colorSpace: "linear" | "srgb" = "linear"): Texture {
  return new Texture({ width: 2, height: 1, format: "rgba8", colorSpace, flipY: false, generateMipmaps: false,
    mipLevels: [{ width: 2, height: 1, data: Uint8Array.of(19, 37, 59, 127, 83, 107, 131, 255) }] });
}

/** Recording stand-in for the separate verified asset/resource owner. */
function resourceFor(device: MockRenderDevice, asset: Asset, image: Texture) {
  let current = true;
  let onAcquire: (() => void) | undefined;
  let latest: ProjectedSpotFrameLease | undefined;
  const revision = image.revision;
  const matchesAsset = vi.fn((candidate: Asset) => current && candidate === asset);
  const acquireFrame = vi.fn((frame: ProjectedSpotFrameIdentity): ProjectedSpotFrameLease | undefined => {
    const token = device.activeFrameToken;
    if (!current || frame.device !== device || !token) return undefined;
    const captured = { ...frame };
    let released = false;
    const lease: ProjectedSpotFrameLease = {
      texture: image,
      isCurrent(now) {
        return current && !released && !image.disposed && image.revision === revision && device.activeFrameToken === token &&
          now.device === captured.device && now.owner === captured.owner && now.viewId === captured.viewId && now.frameIndex === captured.frameIndex;
      },
      release() {
        if (released) return true;
        if (device.activeFrameToken) return false;
        released = true;
        return true;
      }
    };
    latest = lease;
    onAcquire?.();
    return lease;
  });
  return { matchesAsset, acquireFrame, latest: () => latest,
    invalidate() { current = false; }, onAcquire(fn: () => void) { onAcquire = fn; } };
}

function fixture(colorSpace: "linear" | "srgb" = "linear") {
  const device = new MockRenderDevice();
  // Exercise the WebGL-only admission policy without claiming GPU output.
  Object.defineProperty(device, "kind", { value: "webgl2" });
  const owner = {};
  const frame: ProjectedSpotFrameIdentity = { device, owner, viewId: "main", frameIndex: 7 };
  const asset = { id: "image" };
  const image: MutableImage = { texture: asset, offset: [0.125, -0.25], scale: [2, -0.5], rotation: 0.75 };
  const projected: Light = { ...light("projected", 4, "spot"), projectedImage: image };
  const nativeTexture = texture(colorSpace);
  const resource = resourceFor(device, asset, nativeTexture);
  device.beginFrame(16, 16);
  return { device, frame, asset, image, projected, texture: nativeTexture, resource,
    close() {
      if (device.activeFrameToken) device.endFrame();
      resource.latest()?.release();
      nativeTexture.dispose();
      device.dispose();
    } };
}

function ready(result: ReturnType<typeof buildProjectedSpotBindings>): ProjectedSpotBindings {
  if (result.status !== "ready") throw new Error(`Expected ready, got ${result.status}${result.status === "unsupported" ? `:${result.reason}` : ""}`);
  return result;
}

describe("projected-spot checked bindings", () => {
  it("does not acquire a resource when no light requests projection", () => {
    const device = new MockRenderDevice();
    try {
      const lights = [light("ordinary", 1)];
      expect(buildProjectedSpotBindings(lights, LightUniforms.packWithSelection(lights),
        { device, owner: {}, viewId: "main", frameIndex: 0 }, undefined, { clustered: true })).toEqual({ status: "not-required" });
    } finally { device.dispose(); }
  });

  it("binds the exact ranked direct-light slot, preserves its packet, and uses a safe sampler", () => {
    const f = fixture("srgb");
    try {
      const lights: Light[] = [light("dim", 1), f.projected, light("bright", 10)];
      const selection = LightUniforms.packWithSelection(lights, 2);
      const packed = selection.packed.data.slice();
      expect(selection.selected.map((entry) => entry.inputIndex)).toEqual([2, 1]);
      const packet = ready(buildProjectedSpotBindings(lights, selection, f.frame, f.resource));
      expect(packet).toMatchObject({ slot: 1, inputIndex: 1 });
      expect(selection.packed.data).toEqual(packed);
      expect(packet.uniforms).toMatchObject({ u_projectedSpotEnabled: 1, u_projectedSpotIndex: 1,
        u_projectedSpotOffset: [0.125, -0.25], u_projectedSpotScale: [2, -0.5], u_projectedSpotRotation: 0.75 });
      const binding = packet.uniforms.u_projectedSpotMap;
      expect(binding).toMatchObject({ name: "u_projectedSpotMap", texture: f.texture, required: true,
        expectedColorSpace: "srgb", expectedDimension: "2d", offset: [0, 0], scale: [1, 1], rotation: 0 });
      expect(binding.sampler).toMatchObject({ minFilter: "linear", magFilter: "linear", addressU: "clamp-to-edge", addressV: "clamp-to-edge", maxAnisotropy: 1, mirror: false });
      expect(binding.validate().ok).toBe(true);
      expect(packet.isCurrent(f.frame)).toBe(true);
      expect(packet.isCurrent({ ...f.frame, viewId: "other" })).toBe(false);
      expect(packet.isCurrent({ ...f.frame, owner: {} })).toBe(false);
      expect(packet.isCurrent({ ...f.frame, frameIndex: 8 })).toBe(false);
      expect(packet.lease.release()).toBe(false);
      f.device.endFrame();
      expect(packet.isCurrent(f.frame)).toBe(false);
      expect(packet.lease.release()).toBe(true);
      expect(packet.lease.release()).toBe(true);
    } finally { f.close(); }
  });

  it("uses identity defaults without altering the texture binding's own transform", () => {
    const f = fixture();
    try {
      const lights = [{ ...f.projected, projectedImage: { texture: f.asset } }];
      const packet = ready(buildProjectedSpotBindings(lights, LightUniforms.packWithSelection(lights), f.frame, f.resource));
      expect(packet.slot).toBe(0);
      expect(packet.uniforms).toMatchObject({ u_projectedSpotOffset: [0, 0], u_projectedSpotScale: [1, 1], u_projectedSpotRotation: 0 });
      expect(packet.uniforms.u_projectedSpotMap).toMatchObject({ offset: [0, 0], scale: [1, 1], rotation: 0 });
      expect(packet.isCurrent(f.frame)).toBe(true);
    } finally { f.close(); }
  });

  it("reports clustered, multiple, dropped, stale and unavailable routes before acquiring", () => {
    const f = fixture();
    try {
      const lights: Light[] = [f.projected, light("bright", 10)];
      const selection = LightUniforms.packWithSelection(lights);
      expect(buildProjectedSpotBindings(lights, selection, f.frame, f.resource, { clustered: true }))
        .toMatchObject({ status: "unsupported", reason: "clustered" });
      const duplicate = [f.projected, f.projected];
      expect(buildProjectedSpotBindings(duplicate, LightUniforms.packWithSelection(duplicate), f.frame, f.resource))
        .toMatchObject({ status: "unsupported", reason: "multiple-projections" });
      const dropped = LightUniforms.packWithSelection(lights, 1);
      expect(buildProjectedSpotBindings(lights, dropped, f.frame, f.resource))
        .toMatchObject({ status: "unsupported", reason: "light-not-selected" });
      const changed = [...lights].reverse();
      expect(buildProjectedSpotBindings(changed, selection, f.frame, f.resource))
        .toMatchObject({ status: "unsupported", reason: "stale-selection" });
      expect(buildProjectedSpotBindings(lights, selection, { ...f.frame, frameIndex: -1 }, f.resource))
        .toMatchObject({ status: "unsupported", reason: "frame-unavailable" });
      const unsupportedDevice = new MockRenderDevice();
      try {
        expect(buildProjectedSpotBindings(lights, selection, { ...f.frame, device: unsupportedDevice }, f.resource))
          .toMatchObject({ status: "unsupported", reason: "backend-unsupported" });
      } finally { unsupportedDevice.dispose(); }
      expect(buildProjectedSpotBindings(lights, selection, f.frame, undefined))
        .toMatchObject({ status: "unsupported", reason: "texture-unavailable" });
      const foreignImage = { ...f.image, texture: { id: "different" } };
      const foreignLights: Light[] = [{ ...f.projected, projectedImage: foreignImage }];
      expect(buildProjectedSpotBindings(foreignLights, LightUniforms.packWithSelection(foreignLights), f.frame, f.resource))
        .toMatchObject({ status: "unsupported", reason: "texture-unavailable" });
      expect(f.resource.acquireFrame).not.toHaveBeenCalled();
    } finally { f.close(); }
  });

  it("rejects non-spot lights, unrepresentable cones and invalid transforms", () => {
    const f = fixture();
    try {
      const invalidLights: Array<Partial<CollectedLight>> = [
        { kind: "point" }, { direction: [0, 0, 0] }, { direction: [1e30, 0, 0] },
        { position: [Number.NaN, 0, 0] }, { spotAngle: 0 }, { spotAngle: Math.PI / 2 }, { spotAngle: 1e-100 }
      ];
      for (const overrides of invalidLights) {
        const lights = [{ ...f.projected, ...overrides }];
        expect(buildProjectedSpotBindings(lights, LightUniforms.packWithSelection(lights), f.frame, f.resource))
          .toMatchObject({ status: "unsupported", reason: "unsupported-light" });
      }
      const invalidImages: ProjectedSpotImage<Asset>[] = [
        { texture: f.asset, offset: [Number.NaN, 0] }, { texture: f.asset, scale: [0, 1] },
        { texture: f.asset, scale: [1e-100, 1] }, { texture: f.asset, rotation: Infinity },
        { texture: f.asset, offset: null } as unknown as ProjectedSpotImage<Asset>,
        { texture: f.asset, scale: null } as unknown as ProjectedSpotImage<Asset>,
        { texture: f.asset, rotation: null } as unknown as ProjectedSpotImage<Asset>
      ];
      for (const image of invalidImages) {
        const lights = [{ ...f.projected, projectedImage: image }];
        expect(buildProjectedSpotBindings(lights, LightUniforms.packWithSelection(lights), f.frame, f.resource))
          .toMatchObject({ status: "unsupported", reason: "invalid-transform" });
      }
      expect(f.resource.acquireFrame).not.toHaveBeenCalled();
    } finally { f.close(); }
  });

  it("invalidates a packet for light, projection, uniform, sampler and resource changes", () => {
    const changes: Array<(f: ReturnType<typeof fixture>, lights: Light[], packet: ProjectedSpotBindings) => void> = [
      (f) => { f.image.offset![0] = 0.5; },
      (f) => { f.image.scale = [2, -0.5]; },
      (f) => { f.image.texture = { id: "replacement" }; },
      (_f, lights) => { lights[0] = { ...lights[0]!, position: [2, 2, 3] }; },
      (_f, lights) => { lights.push({ ...light("second", 1, "spot"), projectedImage: { texture: { id: "second" } } }); },
      (_f, _lights, packet) => { (packet.uniforms.u_projectedSpotMap.sampler as { minFilter: string }).minFilter = "nearest"; },
      (f) => { f.texture.markNeedsUpdate(); },
      (f) => { f.resource.invalidate(); },
      (f) => { f.device.contextLost = true; }
    ];
    for (const change of changes) {
      const f = fixture();
      try {
        const lights = [f.projected];
        const packet = ready(buildProjectedSpotBindings(lights, LightUniforms.packWithSelection(lights), f.frame, f.resource));
        expect(packet.isCurrent(f.frame)).toBe(true);
        change(f, lights, packet);
        expect(packet.isCurrent(f.frame)).toBe(false);
      } finally { f.close(); }
    }
  });

  it("detects packed-byte mutation and rejects a released or foreign device frame", () => {
    const f = fixture(), other = new MockRenderDevice();
    try {
      const lights = [f.projected];
      const selection = LightUniforms.packWithSelection(lights);
      const packet = ready(buildProjectedSpotBindings(lights, selection, f.frame, f.resource));
      other.beginFrame(16, 16);
      expect(packet.isCurrent({ ...f.frame, device: other })).toBe(false);
      selection.packed.data[0] = 0.25;
      expect(packet.isCurrent(f.frame)).toBe(false);
      f.device.endFrame();
      expect(packet.lease.release()).toBe(true);
      f.device.beginFrame(16, 16);
      expect(packet.isCurrent(f.frame)).toBe(false);
    } finally { if (other.activeFrameToken) other.endFrame(); other.dispose(); f.close(); }
  });

  it("returns the retained lease when inputs change during acquisition", () => {
    const f = fixture();
    try {
      const lights = [f.projected];
      const selection = LightUniforms.packWithSelection(lights);
      f.resource.onAcquire(() => { f.image.offset![0] = 0.625; });
      const result = buildProjectedSpotBindings(lights, selection, f.frame, f.resource);
      expect(result).toMatchObject({ status: "unsupported", reason: "stale-resource", lease: f.resource.latest() });
      if (result.status !== "unsupported" || !result.lease) throw new Error("A post-acquisition failure must return the lease");
      expect(result.lease.release()).toBe(false);
      f.device.endFrame();
      expect(result.lease.release()).toBe(true);
    } finally { f.close(); }
  });

  it("returns an acquired lease when the image fails the base-level texture contract", () => {
    const f = fixture();
    try {
      f.texture.flipY = true;
      const lights = [f.projected];
      const result = buildProjectedSpotBindings(lights, LightUniforms.packWithSelection(lights), f.frame, f.resource);
      expect(result).toMatchObject({ status: "unsupported", reason: "stale-resource", lease: f.resource.latest() });
      expect(f.resource.acquireFrame).toHaveBeenCalledOnce();
    } finally { f.close(); }
  });
});
