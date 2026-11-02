import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { cloneSkinned } from "@aura3d/engine";
import { lookAt, lookParams } from "../../../examples/saiyan-snake-way-port/art/colorScript";
import { RUNNER_MODELS, runnerModelForLook } from "../../../examples/saiyan-snake-way-port/models";
import { createRun, STEP, stepRun } from "../../../examples/saiyan-snake-way-port/sim";
import { RUNNER_STYLES, runnerIndexForLook, runnerStylesForLook } from "../../../examples/saiyan-snake-way-port/styles";
import { loadRunner } from "../../../examples/saiyan-snake-way-port/world";

vi.mock("@aura3d/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aura3d/engine")>();
  return { ...actual, cloneSkinned: vi.fn() };
});

const asset = (name: string): Buffer => readFileSync(new URL(`../../../examples/saiyan-snake-way-port/assets/${name}`, import.meta.url));
const hash = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");
const ORIGINAL_SHA = "5e8a08af3b60c2a36aed4b0d3197c2d1846cf7cfc26a1322d366232cc035b9f4";
const SCRIPT_SHA = "7a1ea836817674f965fe1e42691acb15a51e6812d5519a441fd841584c5c3f7b";
const SOURCE_RED_SHA = "f6e59b7c15d3e7ef0bdd971fe4983a7acae6ecd47dcd06d2dfe3439cf00deb19";

interface Glb {
  json: {
    [key: string]: unknown;
    images: { name: string; bufferView: number }[];
    bufferViews: { byteOffset?: number; byteLength: number }[];
  };
  bin: Buffer;
}
function glb(bytes: Buffer): Glb {
  expect(bytes.readUInt32LE(0)).toBe(0x46546c67);
  expect(bytes.readUInt32LE(8)).toBe(bytes.length);
  const length = bytes.readUInt32LE(12), binStart = 28 + length;
  expect(bytes.readUInt32LE(16)).toBe(0x4e4f534a);
  expect(bytes.readUInt32LE(24 + length)).toBe(0x004e4942);
  return { json: JSON.parse(bytes.subarray(20, 20 + length).toString("utf8")), bin: bytes.subarray(binStart) };
}
function image(g: Glb, name: string): Buffer {
  const i = g.json.images.find((entry) => entry.name === name)!;
  const view = g.json.bufferViews[i.bufferView]!, offset = view.byteOffset ?? 0;
  return g.bin.subarray(offset, offset + view.byteLength);
}
function ancillary(png: Buffer): string[] {
  const result: string[] = [];
  for (let offset = 8; offset < png.length;) {
    const size = png.readUInt32BE(offset), end = offset + size + 12;
    expect(end).toBeLessThanOrEqual(png.length);
    if (png.toString("ascii", offset + 4, offset + 8) !== "IDAT") result.push(png.subarray(offset, end).toString("hex"));
    offset = end;
  }
  return result;
}

describe("Serpentine original runner restoration", () => {
  it("pins original, optimized script, prior red and head provenance without exceeding the GLB budget", () => {
    const old = asset("runner.glb"), script = asset("runner-script.glb"), head = asset("serpentHead.glb");
    const history = JSON.parse(asset("provenance/runner.recolor.json").toString());
    const original = JSON.parse(asset("provenance/runner-original.json").toString());
    expect(hash(old)).toBe(ORIGINAL_SHA);
    expect(hash(script)).toBe(SCRIPT_SHA);
    expect(history.steps[1].sha256).toBe(SOURCE_RED_SHA);
    expect(history.steps[2].sourceSha256).toBe(SOURCE_RED_SHA);
    expect(history.sha256).toBe(SCRIPT_SHA);
    expect(original.sha256).toBe(ORIGINAL_SHA);
    expect(old.length).toBe(4_670_972);
    expect(script.length + head.length).toBe(5_709_552);
    expect(script.length + head.length).toBeLessThanOrEqual(6_000_000);
  });

  it("preserves rig, animation, geometry bytes, non-IDAT PNG chunks and every normal-map sample", async () => {
    const old = glb(asset("runner.glb")), script = glb(asset("runner-script.glb"));
    for (const key of ["meshes", "accessors", "nodes", "skins", "animations", "materials", "images"]) {
      expect(script.json[key], key).toEqual(old.json[key]);
    }
    for (let i = 2; i < old.json.bufferViews.length; i++) {
      const a = old.json.bufferViews[i]!, b = script.json.bufferViews[i]!;
      expect(script.bin.subarray(b.byteOffset ?? 0, (b.byteOffset ?? 0) + b.byteLength).equals(old.bin.subarray(a.byteOffset ?? 0, (a.byteOffset ?? 0) + a.byteLength)), `bufferView ${i}`).toBe(true);
    }
    expect(hash(image(script, "texture_0"))).toBe("ecfba87ffc61e34c390a1cb2d069af1032e7afb441214cdb0e0698376a7c7b86");
    const a = image(old, "normal"), b = image(script, "normal");
    expect(hash(a)).toBe("d1bde5c9ee18b3c0449e04f380ea088d00bf99dbf07c626b476d56f83f1c9361");
    expect(hash(b)).toBe("217f52999b125d5050ef9e11810c2071752b48ce81482084a285b1e2f4af91f6");
    expect(ancillary(b)).toEqual(ancillary(a));
    const rgbaA = await sharp(a).ensureAlpha().raw().toBuffer();
    const rgbaB = await sharp(b).ensureAlpha().raw().toBuffer();
    expect(rgbaB.equals(rgbaA)).toBe(true);
    expect(hash(rgbaB)).toBe("45190ec07f4cdd00d6ee89bf1750acf77518c7a6559bbabbd1a4b5aad60d73ca");
  });

  it("passes the selected same-origin hashed typed ref to cloneSkinned", async () => {
    const actor = { evidence: { clips: ["Run_Loop"] }, animation: { resolvedClipInfos: () => [{ name: "Run_Loop", duration: 1 }] } };
    vi.mocked(cloneSkinned).mockResolvedValue({ actors: [actor], dispose: vi.fn() } as unknown as Awaited<ReturnType<typeof cloneSkinned>>);
    for (const mode of ["original", "script"] as const) {
      const ref = runnerModelForLook(mode);
      expect(ref.kind).toBe("aura-asset-ref");
      expect(ref.hash).toBe(`sha256-${mode === "original" ? ORIGINAL_SHA : SCRIPT_SHA}`);
      expect(ref.url.startsWith("/")).toBe(true);
      expect(ref).toBe(RUNNER_MODELS[mode]);
      await loadRunner({ width: 640, height: 360 } as HTMLCanvasElement, mode);
      expect(cloneSkinned).toHaveBeenLastCalledWith(ref, 1, { width: 640, height: 360, idPrefix: "runner" });
    }
  });

  it("restores exact TIDE style only in original mode and keeps stored choices", () => {
    const original = runnerStylesForLook("original"), script = runnerStylesForLook("script");
    expect(script).toBe(RUNNER_STYLES);
    expect(script[0]).toMatchObject({ tagline: "Red lacquer robe, cyan surge. Calm and quick.", tint: [1, 0.97, 0.95], wash: [0.12, 0.03, 0.02] });
    expect(original[0]).toEqual({ ...script[0], tagline: "Teal suit, cyan surge. Calm and quick.", tint: [0.9, 0.95, 0.95], wash: [0.05, 0.2, 0.22] });
    expect(original.slice(1)).toEqual(script.slice(1));
    for (const mode of ["original", "script"] as const) {
      expect(runnerIndexForLook(mode, null)).toBe(mode === "script" ? 1 : 0);
      expect(runnerIndexForLook(mode, "invalid")).toBe(mode === "script" ? 1 : 0);
      for (const i of [0, 1, 2]) expect(runnerIndexForLook(mode, String(i))).toBe(i);
      expect(runnerIndexForLook(mode, "99")).toBe(2);
      expect(runnerIndexForLook(mode, "-1")).toBe(0);
    }
  });

  it("keeps identical simulation snapshots while either look reads the run", () => {
    const run = (search: string) => {
      const state = createRun(), look = lookParams(search);
      for (let i = 0; i < 600; i++) {
        stepRun(state, i === 50 ? { taps: ["Space"] } : i === 100 ? { taps: ["KeyD"] } : {}, STEP);
        lookAt(state.s, look);
      }
      return state;
    };
    expect(run("?look=original")).toEqual(run(""));
  });
});
