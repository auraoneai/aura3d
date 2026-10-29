import { describe, expect, it } from "vitest";
import { primitives } from "../../../packages/engine/src/agent-api/nodes/primitives";
import { instances } from "../../../packages/engine/src/agent-api/nodes/instances";
import { model } from "../../../packages/engine/src/agent-api/nodes/model";
import type { AuraAssetRef } from "../../../packages/engine/src/agent-api/nodes/types";

/**
 * anim-phys-06: OPTION_IGNORED covered only primitives.* and interactions.*; `model()` and
 * `instances.model` dropped unread keys silently. anim-phys-07: `primitives.box({ transforms })`
 * was accepted and dropped (the key list was shared with instances.*), and instances.* notes
 * were labelled `primitives.*`.
 */
const asset = { kind: "asset", type: "model", key: "crate", url: "/crate.glb", format: "glb" } as unknown as AuraAssetRef<"model">;
const notes = (builder: { toJSON(): unknown }) => (builder.toJSON() as { ignoredOptions?: readonly string[] }).ignoredOptions;

describe("OPTION_IGNORED for model(), instances.model and instances.<kind>", () => {
  it("model() reports an unread key, names model, and lists the valid keys", () => {
    const note = notes(model(asset, { name: "crate", segments: 4 } as never));
    expect(note).toHaveLength(1);
    expect(note![0]).toMatch(/^OPTION_IGNORED model: option "segments" is not read/);
    expect(note![0]).toContain("Valid options: name, position");
  });

  it("model() accepts every key it reads and forwards the transform extras", () => {
    const json = model(asset, {
      name: "crate", position: [1, 2, 3], rotation: [0, 1, 0], scale: 2, castShadow: false, receiveShadow: false, visible: true,
      targetHeight: 2, renderOrder: 3, frustumCulled: false, layers: 2, userData: { tag: "x" }, rotationOrder: "XYZ", quaternion: [0, 0, 0, 1]
    }).toJSON() as unknown as Record<string, unknown>;
    expect(json.ignoredOptions).toBeUndefined();
    expect(json).toMatchObject({ renderOrder: 3, frustumCulled: false, layers: 2, userData: { tag: "x" }, rotationOrder: "XYZ", quaternion: [0, 0, 0, 1] });
  });

  it("model() accepts collider: false and lod: false (nothing to build) but reports other values", () => {
    expect(notes(model(asset, { collider: false, lod: false }))).toBeUndefined();
    const note = notes(model(asset, { collider: "bounds", lod: "auto" }));
    expect(note).toHaveLength(1);
    expect(note![0]).toContain('"lod", "collider"');
  });

  it("model() without options carries no note (node JSON unchanged)", () => {
    expect(Object.keys(model(asset).toJSON())).not.toContain("ignoredOptions");
  });

  it("instances.model accepts transforms, colors, lod and the world options, and reports the rest", () => {
    const transforms = [{ position: [0, 0, 0] as const }];
    expect(notes(instances.model(asset, { transforms, colors: ["#fff"], lod: { levels: [{ maxDistance: 10 }] }, maxInstancesPerDraw: 64, wind: true }))).toBeUndefined();
    const note = notes(instances.model(asset, { transforms, segments: 3 } as never));
    expect(note).toHaveLength(1);
    expect(note![0]).toMatch(/^OPTION_IGNORED instances\.model: option "segments"/);
  });

  it("primitives.box({ transforms }) is reported instead of dropped", () => {
    const note = notes(primitives.box({ transforms: [{ position: [0, 0, 0] }], colors: ["#f00"] } as never));
    expect(note).toHaveLength(1);
    expect(note![0]).toMatch(/^OPTION_IGNORED primitives\.box: options "transforms", "colors" are not read/);
    expect(note![0]).not.toMatch(/Valid options:.*transforms/);
  });

  it("instances.box accepts transforms and colors, and its note names instances.box", () => {
    const transforms = [{ position: [0, 0, 0] as const }];
    expect(notes(instances.box({ transforms, colors: ["#f00"] }))).toBeUndefined();
    const note = notes(instances.box({ transforms, segments: 2 } as never));
    expect(note).toHaveLength(1);
    expect(note![0]).toMatch(/^OPTION_IGNORED instances\.box: option "segments"/);
    expect(note![0]).toContain("transforms, colors");
  });
});
