import { describe, expect, it, vi } from "vitest";
import { Scene } from "@aura3d/scene";
import { collectLight, type CollectedLight } from "../../../packages/rendering/src/LightCollector";
import { LightUniforms, MAX_DIRECT_LIGHTS } from "../../../packages/rendering/src/LightUniforms";
import { Texture } from "../../../packages/rendering/src/Texture";
import {
  buildPhotometricProfileBindings,
  type PhotometricProfileBindings
} from "../../../packages/rendering/src/lighting/PhotometricProfileBindings";

function table() {
  return {
    verticalAngles: [0, 90, 180],
    horizontalAngles: [0],
    candela: [100, 40, 0],
    symmetry: "rotational" as const
  };
}

function point(name: string, intensity = 1): CollectedLight {
  return {
    ...collectLight(new Scene().createLight("point", name)),
    color: [1, 1, 1],
    intensity,
    position: [1, 2, 3],
    direction: [0, -1, 0],
    right: [1, 0, 0],
    up: [0, 1, 0],
    range: 10,
    spotAngle: 0,
    penumbra: 0,
    castsShadow: false,
    layerMask: 1
  };
}

function measured(profile = table(), overrides: Partial<CollectedLight> = {}): CollectedLight {
  return {
    ...point("measured", 0),
    photometricProfile: { profile, scale: 2, rotation: Math.PI / 2 },
    photometricVisible: true,
    photometricDimmer: 0.25,
    ...overrides
  };
}

function ready(lights: CollectedLight[]): {
  packet: PhotometricProfileBindings;
  selection: ReturnType<typeof LightUniforms.packWithSelection>;
} {
  const selection = LightUniforms.packWithSelection(lights);
  const packet = buildPhotometricProfileBindings(lights, selection);
  if (packet.status !== "ready") {
    throw new Error(`Expected a ready profile packet, got ${packet.status}`);
  }
  return { packet, selection };
}

describe("photometric profile bindings", () => {
  it("uses the exact selected slots, including duplicate light occurrences, without touching shadow data", () => {
    const shared = { ...measured(), castsShadow: true, localShadowSlot: 3 };
    const lights = [point("ordinary", 6), shared, shared];
    const selection = LightUniforms.packWithSelection(lights);
    const original = selection.packed.data.slice();
    const packet = buildPhotometricProfileBindings(lights, selection);
    expect(packet.status).toBe("ready");
    if (packet.status !== "ready") return;
    try {
      expect(selection.selected.map(({ inputIndex }) => inputIndex)).toEqual([0, 1, 2]);
      expect(selection.selected[1]!.light).toBe(shared);
      expect(selection.selected[2]!.light).toBe(shared);
      expect(packet.offsets).toHaveLength(MAX_DIRECT_LIGHTS * 4);
      expect(packet.meta).toHaveLength(MAX_DIRECT_LIGHTS * 4);
      expect(Array.from(packet.offsets.slice(0, 12))).toEqual([
        0, 0, 0, 0,
        0, 3, 4, 3,
        7, 10, 11, 3
      ]);
      expect(Array.from(packet.meta.slice(0, 12))).toEqual([
        0, 0, 0, 0,
        1, 0, 0.5, Math.fround(Math.PI / 2),
        1, 0, 0.5, Math.fround(Math.PI / 2)
      ]);
      expect(Array.from(packet.offsets.slice(12))).toEqual(new Array((MAX_DIRECT_LIGHTS - 3) * 4).fill(0));
      expect(Array.from(packet.meta.slice(12))).toEqual(new Array((MAX_DIRECT_LIGHTS - 3) * 4).fill(0));
      expect(selection.packed.data).toEqual(original);
      expect(selection.packed.data[LightUniforms.floatsPerLight + 19]).toBe(4);
      expect(selection.packed.data[2 * LightUniforms.floatsPerLight + 19]).toBe(4);
      expect(packet.atlas.entries.map((entry) => entry.id)).toEqual(["slot-1", "slot-2"]);
      const atlasValues = packet.atlas.texture.data as Float32Array;
      expect(atlasValues[4]).toBe(100);
      expect(atlasValues[11]).toBe(100);
      expect(packet.binding.name).toBe("u_a3dPhotometricAtlas");
      expect(packet.binding.texture).toBe(packet.atlas.texture);
      expect(packet.binding.sampler).toBe(packet.atlas.sampler);
      expect(packet.atlas.texture.format).toBe("r32f");
      expect(packet.atlas.texture.colorSpace).toBe("linear");
      expect(packet.atlas.sampler.minFilter).toBe("nearest");
      expect(packet.binding.validate().ok).toBe(true);
      expect(packet.isCurrent()).toBe(true);
    } finally {
      packet.dispose();
    }
  });

  it("keeps measured candela independent of scalar intensity and encodes hidden profiles as enabled darkness", () => {
    const visibleAtZeroScalar = measured(table(), { intensity: 0, photometricDimmer: 0.5 });
    const hiddenAtPositiveScalar = measured(table(), { intensity: 7, photometricVisible: false });
    const zeroDimmer = measured(table(), { intensity: 5, photometricDimmer: 0 });
    const { packet, selection } = ready([visibleAtZeroScalar, hiddenAtPositiveScalar, zeroDimmer]);
    try {
      expect(selection.packed.data[3]).toBe(0);
      expect(selection.packed.data[LightUniforms.floatsPerLight + 3]).toBe(7);
      expect(Array.from(packet.meta.slice(0, 12))).toEqual([
        1, 0, 1, Math.fround(Math.PI / 2),
        1, 0, 0, Math.fround(Math.PI / 2),
        1, 0, 0, Math.fround(Math.PI / 2)
      ]);
      expect(packet.offsets[3]).toBe(3);
      expect(packet.offsets[7]).toBe(3);
      expect(packet.offsets[11]).toBe(3);
      expect(packet.isCurrent()).toBe(true);
    } finally {
      packet.dispose();
    }
  });

  it("needs no atlas for ordinary lights", () => {
    const lights = [point("ordinary")];
    const result = buildPhotometricProfileBindings(lights, LightUniforms.packWithSelection(lights));
    expect(result).toEqual({ status: "not-required" });
    const empty: CollectedLight[] = [];
    expect(buildPhotometricProfileBindings(empty, LightUniforms.packWithSelection(empty), { clustered: true }))
      .toEqual({ status: "not-required" });
  });

  it("rejects clustered and capacity-limited profile lists explicitly", () => {
    const lights = [measured(), point("second", 100), point("third", 200)];
    expect(buildPhotometricProfileBindings(lights, LightUniforms.packWithSelection(lights), { clustered: true }))
      .toMatchObject({ status: "unsupported", reason: "clustered" });
    // Scalar ranking would omit the measured zero-intensity source, so the
    // metadata builder must not silently use that incomplete selection.
    const selection = LightUniforms.packWithSelection(lights, 2);
    expect(selection.selected.map((entry) => entry.inputIndex)).toEqual([2, 1]);
    expect(buildPhotometricProfileBindings(lights, selection))
      .toMatchObject({ status: "unsupported", reason: "light-capacity" });
  });

  it("rejects unavailable visibility, unsupported kinds, and invalid directions", () => {
    const candidates: Array<[CollectedLight, string]> = [
      [measured(table(), { photometricVisible: undefined }), "visibility-unavailable"],
      [measured(table(), { kind: "directional" }), "unsupported-light"],
      [measured(table(), { kind: "rect-area" }), "unsupported-light"],
      [measured(table(), { direction: [0, 0, 0] }), "unsupported-light"],
      [measured(table(), { direction: [0, Number.NaN, 1] }), "unsupported-light"]
    ];
    for (const [light, reason] of candidates) {
      const lights = [light];
      expect(buildPhotometricProfileBindings(lights, LightUniforms.packWithSelection(lights)))
        .toMatchObject({ status: "unsupported", reason });
    }
  });

  it("rejects an outdated selection after a source occurrence or packed value changes", () => {
    const source = measured();
    const lights = [source, point("other")];
    const selection = LightUniforms.packWithSelection(lights);
    lights[1] = point("replacement");
    expect(buildPhotometricProfileBindings(lights, selection))
      .toMatchObject({ status: "unsupported", reason: "stale-selection" });

    const otherLights = [measured()];
    const otherSelection = LightUniforms.packWithSelection(otherLights);
    Object.assign(otherLights[0]!, { intensity: 3 });
    expect(buildPhotometricProfileBindings(otherLights, otherSelection))
      .toMatchObject({ status: "unsupported", reason: "stale-selection" });
  });

  it("rejects invalid profile samples and float32 overflow or underflow after dimming", () => {
    const invalid = table();
    invalid.candela[1] = -1;
    const lowSamples = table();
    lowSamples.candela = [1e-38, 1e-38, 0];
    const candidates = [
      measured(invalid),
      measured(table(), { photometricDimmer: Number.POSITIVE_INFINITY }),
      measured(table(), { photometricDimmer: 1e37 }),
      measured(table(), { photometricProfile: { profile: table(), scale: 1e-20 }, photometricDimmer: 1e-30 }),
      measured(lowSamples, { photometricProfile: { profile: lowSamples }, photometricDimmer: 1e-10 })
    ];
    for (const light of candidates) {
      const lights = [light];
      expect(buildPhotometricProfileBindings(lights, LightUniforms.packWithSelection(lights)))
        .toMatchObject({ status: "unsupported", reason: "invalid-profile" });
    }
  });

  it("disposes a newly allocated atlas when later runtime scale validation fails", () => {
    const dispose = vi.spyOn(Texture.prototype, "dispose");
    try {
      const lights = [measured(table(), { photometricDimmer: 1e37 })];
      expect(buildPhotometricProfileBindings(lights, LightUniforms.packWithSelection(lights)))
        .toMatchObject({ status: "unsupported", reason: "invalid-profile" });
      expect(dispose).toHaveBeenCalledTimes(1);
    } finally {
      dispose.mockRestore();
    }
  });

  it("detects source profile, selection, and returned metadata mutations", () => {
    const mutations: Array<(state: {
      profile: ReturnType<typeof table>;
      light: CollectedLight;
      lights: CollectedLight[];
      packet: PhotometricProfileBindings;
      selection: ReturnType<typeof LightUniforms.packWithSelection>;
    }) => void> = [
      ({ profile }) => { profile.verticalAngles[1] = 60; },
      ({ profile }) => { profile.horizontalAngles[0] = 1; },
      ({ profile }) => { profile.candela[0] = 200; },
      ({ light }) => { Object.assign(light, { photometricVisible: false }); },
      ({ light }) => { Object.assign(light, { photometricDimmer: 0.5 }); },
      ({ light }) => { Object.assign(light, { photometricProfile: { ...light.photometricProfile!, scale: 3 } }); },
      ({ light }) => { Object.assign(light, { photometricProfile: undefined }); },
      ({ lights }) => { lights[0] = measured(); },
      ({ packet }) => { packet.offsets[0] = 1; },
      ({ packet }) => { packet.meta[2] = 1; },
      ({ selection }) => { selection.packed.data[3] = 9; }
    ];
    for (const mutate of mutations) {
      const profile = table();
      const light = measured(profile);
      const lights = [light];
      const { packet, selection } = ready(lights);
      try {
        expect(packet.isCurrent()).toBe(true);
        mutate({ profile, light, lights, packet, selection });
        expect(packet.isCurrent()).toBe(false);
      } finally {
        packet.dispose();
      }
    }
  });

  it("detects owned texture and sampler mutations and disposes its texture once", () => {
    const first = ready([measured()]).packet;
    const firstTexture = first.atlas.texture;
    const dispose = vi.spyOn(firstTexture, "dispose");
    (firstTexture.data as Float32Array)[4] = 999;
    expect(first.isCurrent()).toBe(false);
    first.dispose();
    first.dispose();
    expect(firstTexture.disposed).toBe(true);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(first.isCurrent()).toBe(false);

    const second = ready([measured()]).packet;
    try {
      (second.atlas.sampler as { minFilter: string }).minFilter = "linear";
      expect(second.isCurrent()).toBe(false);
    } finally {
      second.dispose();
    }
  });
});
