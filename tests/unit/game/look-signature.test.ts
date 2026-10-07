import { describe, expect, it } from "vitest";
import {
  lookSignature,
  lookManifest,
  lookManifestString
} from "../../../packages/game/src/capture/lookSignature";

const baseScene = () => ({
  background: { color: "#101018" },
  environment: { preset: "studio" },
  camera: { pose: "orbit", fov: 45 },
  lights: [
    { id: "key", type: "directional", intensity: 2 },
    { id: "fill", type: "point", intensity: 0.5 }
  ],
  materials: {
    felt: { color: "#0a7", emissiveIntensity: 0 },
    cue: { color: "#eee", emissiveIntensity: 0.1 }
  },
  effects: [{ kind: "bloom", strength: 0.4 }],
  nodes: [
    { id: "table", asset: "table.glb", material: "felt", scale: [1, 1, 1], visible: true, position: [0, 0, 0] },
    { id: "cue-ball", asset: "ball.glb", material: "cue", scale: [1, 1, 1], visible: true, position: [0, 1, 0] }
  ]
});

const rendererOptions = { toneMappingExposure: 1.1, antialias: true };

describe("lookSignature (PRD-09)", () => {
  it("is identical for snapshots differing only in camera pose", async () => {
    const a = await lookSignature({ ...baseScene(), rendererOptions });
    const b = await lookSignature({
      ...baseScene(),
      camera: { pose: "top-down", fov: 60 },
      rendererOptions
    });
    expect(a).toBe(b);
  });

  it("ignores runtime transforms: setPosition after mount does not change the hash", async () => {
    const moved = baseScene();
    moved.nodes = [
      { ...moved.nodes[0], position: [5, 0, 0] },
      { ...moved.nodes[1], position: [-2, 1, 3] }
    ];
    const a = await lookSignature({ ...baseScene(), rendererOptions });
    const b = await lookSignature({ ...moved, rendererOptions });
    expect(a).toBe(b);
  });

  it("differs when a material emissiveIntensity changes", async () => {
    const other = baseScene();
    other.materials = { ...other.materials, cue: { ...other.materials.cue, emissiveIntensity: 0.9 } };
    const a = await lookSignature({ ...baseScene(), rendererOptions });
    const b = await lookSignature({ ...other, rendererOptions });
    expect(a).not.toBe(b);
  });

  it("differs when a light intensity changes", async () => {
    const other = baseScene();
    other.lights = [{ ...other.lights[0], intensity: 3 }, other.lights[1]];
    const a = await lookSignature({ ...baseScene(), rendererOptions });
    const b = await lookSignature({ ...other, rendererOptions });
    expect(a).not.toBe(b);
  });

  it("differs on authored scale and authored visible changes", async () => {
    const scaled = baseScene();
    scaled.nodes = [{ ...scaled.nodes[0], scale: [2, 2, 2] }, scaled.nodes[1]];
    const hidden = baseScene();
    hidden.nodes = [{ ...hidden.nodes[0], visible: false }, hidden.nodes[1]];
    const a = await lookSignature({ ...baseScene(), rendererOptions });
    expect(await lookSignature({ ...scaled, rendererOptions })).not.toBe(a);
    expect(await lookSignature({ ...hidden, rendererOptions })).not.toBe(a);
  });

  it("differs on renderer tone-map exposure", async () => {
    const a = await lookSignature({ ...baseScene(), rendererOptions });
    const b = await lookSignature({ ...baseScene(), rendererOptions: { ...rendererOptions, toneMappingExposure: 1.8 } });
    expect(a).not.toBe(b);
  });

  it("is insensitive to object key order", () => {
    const ordered = { background: { color: "#101018" }, nodes: [{ id: "a", asset: "x", scale: 1, visible: true }] };
    const shuffled = { nodes: [{ visible: true, scale: 1, asset: "x", id: "a" }], background: { color: "#101018" } };
    expect(lookManifestString(ordered)).toBe(lookManifestString(shuffled));
  });

  it("manifest keys and node ids are sorted deterministically", () => {
    const manifest = lookManifest(baseScene());
    const keys = Object.keys(manifest);
    expect(keys).toEqual([...keys].sort());
    const nodeIds = Object.keys(manifest.nodes as Record<string, unknown>);
    expect(nodeIds).toEqual([...nodeIds].sort());
  });
});
