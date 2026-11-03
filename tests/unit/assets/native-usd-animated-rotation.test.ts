import { describe, expect, it } from "vitest";
import { USDLoader } from "../../../packages/assets/src/loaders/USDLoader";
import { LoadContext } from "../../../packages/assets/src/LoadContext";

const source = (properties: string, metadata = ""): string => `#usda 1.0
(
  metersPerUnit = 1
  upAxis = "Y"
  timeCodesPerSecond = 24
  startTimeCode = 0
  ${metadata}
)
def Xform "Animated" {
  ${properties}
}
`;
const dataUrl = (text: string): string => `data:text/plain,${encodeURIComponent(text)}`;
const load = async (text: string, loader = new USDLoader()) => ({ loader, asset: await loader.load({ url: dataUrl(text), type: "usd" }, new LoadContext()) });
const equivalentQuat = (actual: unknown, expected: readonly number[], digits = 5): void => {
  expect(Array.isArray(actual)).toBe(true);
  const q = actual as number[];
  const dot = q.reduce((sum, value, index) => sum + value * expected[index]!, 0);
  expect(Math.abs(dot)).toBeCloseTo(1, digits);
};
const zRotation = (degrees: number): number[] => [0, 0, Math.sin(degrees * Math.PI / 360), Math.cos(degrees * Math.PI / 360)];

describe("USD single-axis animated rotation", () => {
  it("preserves full turns, direction, sample times and root units through the public importer", async () => {
    const { loader, asset } = await load(source(`
      double3 xformOp:translate = (1, 2, 3)
      float xformOp:rotateZ.timeSamples = { 0: 0, 24: 720 }
      float3 xformOp:scale = (2, 3, 4)
      uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:rotateZ", "xformOp:scale"]
    `));
    try {
      const clip = asset.animations[0]!;
      const rotation = clip.tracks.find((track) => track.target.endsWith(".rotation"));
      expect(rotation).toBeDefined();
      expect(rotation!.keyframes).toHaveLength(9);
      for (const [time, angle] of [[0.125, 90], [0.25, 180], [0.5, 360], [0.75, 540], [1, 720]] as const) {
        equivalentQuat(rotation!.sample(time), zRotation(angle));
      }
      expect(asset.usdDiagnostics.some((item) => item.code === "USD_ROTATION_RESAMPLED")).toBe(true);
      const scene = asset.createScene();
      const node = scene.findByName("Animated")[0]!;
      expect(node.transform.position).toEqual([1, 2, 3]);
      expect(node.transform.scale).toEqual([2, 3, 4]);
    } finally { loader.dispose(asset); }
  });

  it("interpolates negative rotation and preserves static rotation beside animated translation", async () => {
    const first = await load(source(`
      float xformOp:rotateZ.timeSamples = { 0: 0, 24: -270 }
      uniform token[] xformOpOrder = ["xformOp:rotateZ"]
    `));
    try {
      const rotation = first.asset.animations[0]!.tracks[0]!;
      equivalentQuat(rotation.sample(0.5), zRotation(-135));
      equivalentQuat(rotation.sample(1), zRotation(-270));
    } finally { first.loader.dispose(first.asset); }

    const second = await load(source(`
      double3 xformOp:translate.timeSamples = { 0: (0,0,0), 48: (2,4,6) }
      float xformOp:rotateZ = 90
      uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:rotateZ"]
    `));
    try {
      const scene = second.asset.createScene();
      const node = scene.findByName("Animated")[0]!;
      equivalentQuat(node.transform.rotation, zRotation(90));
      const translation = second.asset.animations[0]!.tracks.find((track) => track.target.endsWith(".translation"));
      expect(translation!.sample(1)).toEqual([1, 2, 3]);
      expect(second.asset.usdDiagnostics.some((item) => item.code === "USD_ANIMATION_UNSUPPORTED")).toBe(false);
    } finally { second.loader.dispose(second.asset); }
  });

  it("handles each axis and shifts negative source time consistently with the stage", async () => {
    for (const [axis, expected] of [
      ["X", [Math.SQRT1_2, 0, 0, Math.SQRT1_2]],
      ["Y", [0, Math.SQRT1_2, 0, Math.SQRT1_2]],
      ["Z", [0, 0, Math.SQRT1_2, Math.SQRT1_2]]
    ] as const) {
      const { loader, asset } = await load(source(`
        float xformOp:rotate${axis}.timeSamples = { -24: 0, 24: 180 }
        uniform token[] xformOpOrder = ["xformOp:rotate${axis}"]
      `));
      try {
        const track = asset.animations[0]!.tracks[0]!;
        equivalentQuat(track.sample(1), expected);
        expect(track.duration).toBe(2);
        expect(asset.usdDiagnostics.some((item) => item.code === "USD_TIME_ORIGIN_SHIFTED")).toBe(true);
      } finally { loader.dispose(asset); }
    }
  });

  it("uses authored degree values across wrap boundaries and sorts descending sample times", async () => {
    const { loader, asset } = await load(source(`
      float xformOp:rotateZ.timeSamples = { 24: -170, 0: 170 }
      uniform token[] xformOpOrder = ["xformOp:rotateZ"]
    `));
    try {
      const rotation = asset.animations[0]!.tracks[0]!;
      for (const [time, angle] of [[0, 170], [0.25, 85], [0.5, 0], [0.75, -85], [1, -170]] as const) {
        equivalentQuat(rotation.sample(time), zRotation(angle));
      }
      expect(rotation.keyframes[0]!.time).toBe(0);
      expect(rotation.keyframes[rotation.keyframes.length - 1]!.time).toBe(1);
    } finally { loader.dispose(asset); }
  });

  it("holds all animated TRS values up to the next sample in explicit held stage mode", async () => {
    const loader = new USDLoader(undefined, {}, { interpolation: "held" });
    const result = await load(source(`
      double3 xformOp:translate.timeSamples = { 0: (0,0,0), 12: (2,4,6), 24: (4,8,12) }
      float xformOp:rotateZ.timeSamples = { 0: 0, 12: 270, 24: -170 }
      float3 xformOp:scale.timeSamples = { 0: (1,1,1), 12: (2,2,2), 24: (3,3,3) }
      uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:rotateZ", "xformOp:scale"]
    `), loader);
    const { asset } = result;
    try {
      const rotation = asset.animations[0]!.tracks.find((track) => track.target.endsWith(".rotation"))!;
      const translation = asset.animations[0]!.tracks.find((track) => track.target.endsWith(".translation"))!;
      const scale = asset.animations[0]!.tracks.find((track) => track.target.endsWith(".scale"))!;
      expect(rotation.keyframes).toHaveLength(3);
      expect(rotation.keyframes.every((key) => key.interpolation === "step")).toBe(true);
      equivalentQuat(rotation.sample(-1), zRotation(0));
      equivalentQuat(rotation.sample(0.5 - 1e-6), zRotation(0));
      equivalentQuat(rotation.sample(0.5), zRotation(270));
      equivalentQuat(rotation.sample(1 - 1e-6), zRotation(270));
      equivalentQuat(rotation.sample(1), zRotation(-170));
      equivalentQuat(rotation.sample(2), zRotation(-170));
      expect(translation.sample(0.5 - 1e-6)).toEqual([0, 0, 0]);
      expect(translation.sample(0.5)).toEqual([2, 4, 6]);
      expect(scale.sample(0.5 - 1e-6)).toEqual([1, 1, 1]);
      expect(scale.sample(0.5)).toEqual([2, 2, 2]);
      expect(asset.usdDiagnostics.some((item) => item.code === "USD_ROTATION_RESAMPLED")).toBe(false);
    } finally { loader.dispose(asset); }
  });

  it("rejects unknown runtime interpolation modes", () => {
    expect(() => new USDLoader(undefined, {}, { interpolation: "cubic" as "linear" })).toThrow(/USD_INTERPOLATION_UNSUPPORTED/);
  });

  it("reports when held transition times require float32 rounding", async () => {
    const loader = new USDLoader(undefined, {}, { interpolation: "held" });
    const { asset } = await load(source(`
      float xformOp:rotateZ.timeSamples = { 0: 0, 1: 90 }
      uniform token[] xformOpOrder = ["xformOp:rotateZ"]
    `), loader);
    try {
      const rotation = asset.animations[0]!.tracks[0]!;
      expect(rotation.keyframes[1]!.time).toBe(Math.fround(1 / 24));
      expect(asset.usdDiagnostics.some((item) => item.code === "USD_ANIMATION_TIME_QUANTIZED" && item.message.includes("held"))).toBe(true);
      equivalentQuat(rotation.sample(Math.fround(1 / 24)), zRotation(90));
    } finally { loader.dispose(asset); }
  });

  it("keeps animated rotations in authored space under the stage unit and axis conversion", async () => {
    const text = source(`
      float xformOp:rotateZ.timeSamples = { 0: 0, 24: 90 }
      uniform token[] xformOpOrder = ["xformOp:rotateZ"]
    `).replace("metersPerUnit = 1", "metersPerUnit = 0.01").replace('upAxis = "Y"', 'upAxis = "Z"');
    const { loader, asset } = await load(text);
    try {
      const scene = asset.createScene();
      const conversion = scene.findByName("USD stage units and axis")[0]!;
      expect(conversion.transform.scale).toEqual([0.01, 0.01, 0.01]);
      equivalentQuat(conversion.transform.rotation, [-Math.SQRT1_2, 0, 0, Math.SQRT1_2]);
      equivalentQuat(asset.animations[0]!.tracks[0]!.sample(0.5), zRotation(45));
    } finally { loader.dispose(asset); }
  });

  it("keeps unsupported multiple rotations as a diagnosed static transform", async () => {
    const { loader, asset } = await load(source(`
      float xformOp:rotateX.timeSamples = { 0: 0, 24: 90 }
      float xformOp:rotateY = 30
      uniform token[] xformOpOrder = ["xformOp:rotateX", "xformOp:rotateY"]
    `));
    try {
      expect(asset.animations).toHaveLength(0);
      expect(asset.usdDiagnostics.some((item) => item.code === "USD_ANIMATION_UNSUPPORTED")).toBe(true);
    } finally { loader.dispose(asset); }
  });

  it("diagnoses excessive angular expansion and unrepresentable times without allocating an unbounded track", async () => {
    for (const samples of ["0: 0, 24: 10000000", "0: 0, 0.000000000000000000000000000000000000000000001: 180"]) {
      const { loader, asset } = await load(source(`
        float xformOp:rotateZ.timeSamples = { ${samples} }
        uniform token[] xformOpOrder = ["xformOp:rotateZ"]
      `));
      try {
        expect(asset.animations).toHaveLength(0);
        expect(asset.usdDiagnostics.some((item) => item.code === "USD_ANIMATION_UNSUPPORTED")).toBe(true);
      } finally { loader.dispose(asset); }
    }
  });

  it("shares the generated-key budget across the stage", async () => {
    const loader = new USDLoader(undefined, { maxExpandedBytes: 96 });
    const text = source(`
      float xformOp:rotateZ.timeSamples = { 0: 0, 24: 90 }
      uniform token[] xformOpOrder = ["xformOp:rotateZ"]
    `) + `
def Xform "Second" {
  float xformOp:rotateX.timeSamples = { 0: 0, 24: 90 }
  uniform token[] xformOpOrder = ["xformOp:rotateX"]
}
`;
    const { asset } = await load(text, loader);
    try {
      expect(asset.animations[0]!.tracks).toHaveLength(1);
      expect(asset.usdDiagnostics.some((item) => item.code === "USD_ANIMATION_UNSUPPORTED" && item.path === "/Second" && item.message.includes("generated-key"))).toBe(true);
    } finally { loader.dispose(asset); }
  });

  it("rejects malformed axis samples instead of silently inventing an angle", async () => {
    const invalid = source(`
      float xformOp:rotateX.timeSamples = { 0: 0, 24: (1, 2, 3) }
      uniform token[] xformOpOrder = ["xformOp:rotateX"]
    `);
    await expect(load(invalid)).rejects.toThrow(/USD_ANIMATION.*invalid angle/);
  });
});
