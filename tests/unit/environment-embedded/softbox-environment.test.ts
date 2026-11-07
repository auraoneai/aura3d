import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { environments, material, primitives, scene } from "../../../packages/engine/src/index.js";
import { qrFlagsWithStudioGlass, resolveQrFlags } from "../../../packages/engine/src/contracts/flags.js";
import { isStudioMaterial } from "../../../packages/engine/src/agent-api/nodes/studioMaterial.js";
import { sceneUsesStudioGlass } from "../../../packages/engine/src/agent-api/nodes/scene.js";
import { SOFTBOX_SPECULAR_GZIP_BASE64, SOFTBOX_SPECULAR_SHA256, SOFTBOX_SH9 } from "../../../packages/rendering/src/environment/softboxEmbedded.js";
import { readRgb9e5Cube } from "../../../packages/rendering/src/environment/Rgb9e5Cube.js";
import { NEUTRAL_FLOOR_RADIANCE } from "../../../packages/rendering/src/environment/probeBuild.js";
import { sampleSoftboxEnvironment } from "../../../packages/rendering/src/environment/SoftboxEnvironmentScene.js";

const file = readFileSync("public/aura-environments/softbox.specular.ktx2");
const manifest = JSON.parse(readFileSync("public/aura-environments/softbox.manifest.json", "utf8")) as { sha256: { specular: string }; faceSize: number; mipCount: number };

describe("softbox environment", () => {
  it("embedded copy is byte-identical to the shipped file and small enough for the 25 MiB rule", () => {
    const bytes = gunzipSync(Buffer.from(SOFTBOX_SPECULAR_GZIP_BASE64, "base64"));
    expect(Buffer.compare(bytes, file)).toBe(0);
    expect(createHash("sha256").update(file).digest("hex")).toBe(manifest.sha256.specular);
    expect(SOFTBOX_SPECULAR_SHA256).toBe(manifest.sha256.specular);
    expect(file.byteLength).toBeLessThan(1024 * 1024);
    const cube = readRgb9e5Cube(new Uint8Array(file.buffer, file.byteOffset, file.byteLength));
    expect(cube.faceSize).toBe(manifest.faceSize);
    expect(cube.mipCount).toBe(manifest.mipCount);
    expect(SOFTBOX_SH9).toHaveLength(27);
    // diffuse brightness matches the neutral exposure target: SH9 DC of a constant L is L * sqrt(4 pi) * Y00 ~ 3.5449 * 0.2820 * ... (checked against neutral's 3.756 for 1.0585)
    expect(SOFTBOX_SH9[0]!).toBeGreaterThan(3.6);
    expect(SOFTBOX_SH9[0]!).toBeLessThan(3.9);
    expect(NEUTRAL_FLOOR_RADIANCE).toBeCloseTo(1.0585, 3);
  });

  it("is structured: bright softboxes, dark flags and a mid room, not near-uniform", () => {
    const samples: number[] = [];
    for (let i = 0; i < 4000; i += 1) {
      const z = 1 - 2 * ((i + 0.5) / 4000);
      const r = Math.sqrt(1 - z * z);
      const a = i * 2.399963229728653;
      const [lr, lg, lb] = sampleSoftboxEnvironment([r * Math.cos(a), z, r * Math.sin(a)]);
      samples.push((lr + lg + lb) / 3);
    }
    samples.sort((x, y) => x - y);
    const p5 = samples[Math.floor(samples.length * 0.05)]!;
    const p99 = samples[Math.floor(samples.length * 0.99)]!;
    expect(p99 / Math.max(p5, 1e-4)).toBeGreaterThan(30);
  });

  it("environments.studio() is unchanged and { preset: 'softbox' } opts in", () => {
    const plain = environments.studio({ intensity: 1.05, background: false }).toJSON() as unknown as Record<string, unknown>;
    expect(plain.preset).toBe("studio");
    expect(plain.environment).toBe("preset");
    expect(plain.name).toBe("studio ibl environment");
    const soft = environments.studio({ preset: "softbox", intensity: 1.05, background: false }).toJSON() as unknown as Record<string, unknown>;
    expect(soft.preset).toBe("softbox");
    expect(soft.environment).toBe("preset");
    expect(soft.background).toBe(false);
    const explicitStudio = environments.studio({ preset: "studio" }).toJSON() as unknown as Record<string, unknown>;
    expect(explicitStudio.preset).toBe("studio");
  });
});

describe("studio material helpers", () => {
  it("studioMetal and studioGlass carry sensible reflection settings and allow overrides", () => {
    const metal = material.studioMetal({ color: "#ffdb85", roughness: 0.14 });
    expect(metal).toMatchObject({ color: "#ffdb85", roughness: 0.14, metalness: 1, metallic: 1 });
    expect(isStudioMaterial(metal)).toBe(true);
    expect(isStudioMaterial(material.metal())).toBe(false);
    expect(Object.keys(metal)).not.toContain("studioEnvironment");
    const glass = material.studioGlass({ tint: "#b5e4f5", ior: 1.45, thickness: 1.4 });
    expect(glass).toMatchObject({ transmission: 1, ior: 1.45, thickness: 1.4, color: "#b5e4f5", attenuationColor: "#b5e4f5" });
    expect(isStudioMaterial(glass)).toBe(true);
    expect(material.studioMetal({ roughness: 0.4, envMapIntensity: 2 })).toMatchObject({ roughness: 0.4, envMapIntensity: 2 });
  });

  it("studio glass turns physical transmission on unless a source set the flag; other scenes are untouched", () => {
    const glassScene = scene().add(primitives.sphere({ name: "g", size: 1, material: material.studioGlass() })).toJSON();
    const metalScene = scene().add(primitives.sphere({ name: "m", size: 1, material: material.studioMetal() })).toJSON();
    const plainScene = scene().add(primitives.sphere({ name: "p", size: 1, material: material.clearGlass() })).toJSON();
    expect(sceneUsesStudioGlass(glassScene.nodes)).toBe(true);
    expect(sceneUsesStudioGlass(metalScene.nodes)).toBe(false);
    expect(sceneUsesStudioGlass(plainScene.nodes)).toBe(false);
    const defaults = resolveQrFlags({});
    expect(defaults.on("A3D_QR_MATERIALS_TRANSMISSION")).toBe(false);
    expect(qrFlagsWithStudioGlass(defaults, true).on("A3D_QR_MATERIALS_TRANSMISSION")).toBe(true);
    expect(qrFlagsWithStudioGlass(defaults, false)).toBe(defaults);
    const off = resolveQrFlags({ url: "http://x/?a3d-qr=-materials.transmission" });
    expect(qrFlagsWithStudioGlass(off, true).on("A3D_QR_MATERIALS_TRANSMISSION")).toBe(false);
  });

  it("a scene with a studio material and no environment binds the softbox probe; an authored environment wins", () => {
    const sphere = (m: ReturnType<typeof material.studioMetal>) => primitives.sphere({ name: "s", size: 1, material: m });
    const auto = scene().add(sphere(material.studioMetal())).toJSON();
    const envs = auto.nodes.filter((n) => n.kind === "environment") as unknown as { preset?: string }[];
    expect(envs).toHaveLength(1);
    expect(envs[0]!.preset).toBe("softbox");
    const authored = scene().add(environments.neutral()).add(sphere(material.studioMetal())).toJSON();
    expect(authored.nodes.filter((n) => n.kind === "environment")).toHaveLength(1);
    expect((authored.nodes.find((n) => n.kind === "environment") as unknown as { environment: string }).environment).toBe("neutral");
    const plain = scene().add(primitives.sphere({ name: "p", size: 1, material: material.metal() })).toJSON();
    expect(plain.nodes.filter((n) => n.kind === "environment")).toHaveLength(0);
  });
});
