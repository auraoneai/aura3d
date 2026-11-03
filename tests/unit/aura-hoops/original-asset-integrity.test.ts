import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { assets } from "../../../apps/showcase-aura-hoops-3d/src/aura-assets.route";

vi.mock("@aura3d/engine", () => ({
  defineAuraAssets: <T>(definitions: T) => definitions
}));

const ROOT = path.resolve(__dirname, "../../..");
const MANIFEST = JSON.parse(readFileSync(path.join(ROOT, "aura.assets.json"), "utf8")) as {
  assets: {
    id: string;
    source: string;
    outputPath: string;
    url: string;
    hash: string;
    sizeBytes: number;
    derived?: unknown;
  }[];
};

const ORIGINALS = [
  {
    id: "hoopsBall",
    source: "artifacts/meshy/hoops-ball/model.opt.glb",
    outputPath: "public/aura-assets/hoopsBall.2aed886a.glb",
    url: "/aura-assets/hoopsBall.2aed886a.glb",
    hash: "sha256-158f2bb2b516623368509d02854b0f88bb7e0ae7663bf21d659a8ce2a08b9e22",
    sizeBytes: 933456,
    bounds: [1.902, 1.903, 1.903]
  },
  {
    id: "hoopsHoopRig",
    source: "artifacts/meshy/hoops-hoop-rig/model.opt.glb",
    outputPath: "public/aura-assets/hoopsHoopRig.b6d696b6.glb",
    url: "/aura-assets/hoopsHoopRig.b6d696b6.glb",
    hash: "sha256-f538cf590d928ffeb3dc30624917cef8cc4466c50c326e13f833be8e469a931c",
    sizeBytes: 1030296,
    bounds: [1.002, 1.903, 0.489]
  }
] as const;

function digest(bytes: Buffer): string {
  return `sha256-${createHash("sha256").update(bytes).digest("hex")}`;
}

describe("Aura Hoops original equipment asset integrity", () => {
  for (const original of ORIGINALS) {
    it(`${original.id} records the exact source and published output in the root manifest`, () => {
      const matches = MANIFEST.assets.filter((asset) => asset.id === original.id);
      expect(matches).toHaveLength(1);
      expect(matches[0]).toMatchObject({ ...original, type: "model", format: "glb" });
      expect(matches[0]!.derived).toBeUndefined();
      expect(matches[0]!.outputPath).toBe(`public${matches[0]!.url}`);
    });

    it(`${original.id} published GLB has the original byte count and SHA-256`, () => {
      const bytes = readFileSync(path.join(ROOT, original.outputPath));
      expect(bytes.subarray(0, 4).toString("ascii")).toBe("glTF");
      expect(bytes.readUInt32LE(4)).toBe(2);
      expect(bytes.readUInt32LE(8)).toBe(bytes.length);
      expect(bytes.length).toBe(original.sizeBytes);
      expect(digest(bytes)).toBe(original.hash);
    });

    it(`${original.id} route metadata matches the manifest and the published GLB`, () => {
      const manifestEntry = MANIFEST.assets.find((asset) => asset.id === original.id)!;
      const ref = assets[original.id];
      const bytes = readFileSync(path.join(ROOT, original.outputPath));
      expect(ref).toMatchObject({
        type: "model",
        format: "glb",
        url: original.url,
        bounds: original.bounds
      });
      expect.soft(ref.hash).toBe(manifestEntry.hash);
      expect.soft(ref.sizeBytes).toBe(manifestEntry.sizeBytes);
      expect.soft(ref.hash).toBe(digest(bytes));
      expect.soft(ref.sizeBytes).toBe(bytes.length);
    });
  }
});
