import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Regression coverage for defects 54 and 55.
 *
 * 54: the typed arena backdrop submitted draws every frame and was then clipped in its entirety by
 * the camera far plane. `far = farthestDepth + farPadding` derives from the *framed* bounds, and a
 * large backdrop sets `includeInAutoFrame: false` so it cannot drag the frame volume out — which
 * also excluded it from the depth range. At `farPadding: 1.8` the far plane landed 6.6-8.1 units
 * out while the arena sat 6.7-10.5 units from the camera. It rendered nothing even with a fully
 * emissive material, and only appeared when moved in front of the fighters.
 *
 * 55: the lightweight arena build strips 19 texture maps, but glTF `metallicFactor` /
 * `roughnessFactor` multiply the metallic-roughness texture and default to 1.0 when absent. Every
 * textured source material omitted them, so stripping left fully metallic surfaces. The renderer
 * computes `kd = (1 - metallic)`, zeroing diffuse, so each became a black mirror.
 */
describe("Aura Clash typed arena stays renderable", () => {
  it("keeps the side-view far plane deep enough for an unframed backdrop", () => {
    const preset = readFileSync("packages/engine/src/production-runtime/GameRenderPreset.ts", "utf8");
    const farPadding = Number(preset.match(/farPadding: ([\d.]+)/)?.[1]);
    expect(Number.isFinite(farPadding)).toBe(true);
    // The Aura Clash arena sits up to ~10.5 units from the camera while the framed fight plane is
    // ~1.6 deep, so the padding must cover the gap the framed bounds cannot see.
    expect(farPadding).toBeGreaterThanOrEqual(10);
    expect(preset).toMatch(/far plane is derived from the \*framed\* bounds/);
  });

  it("bakes measured material factors when the arena build strips textures", () => {
    const build = readFileSync("apps/aura-clash-showcase/scripts/build-lightweight-arena-glb.mjs", "utf8");
    expect(build).toContain("MEASURED_MATERIAL_FACTORS");
    // Stripping a texture without replacing its factors is the defect; the build must refuse to.
    expect(build).toContain("unmappedTexturedMaterials");
    expect(build).toMatch(/metallicFactor 1\.0 default/);
  });

  it("ships an arena GLB whose materials are not fully metallic", () => {
    const manifest = JSON.parse(
      readFileSync("apps/aura-clash-showcase/aura.assets.json", "utf8")
    ) as { readonly assets: readonly { readonly id: string; readonly outputPath: string }[] };
    const arena = manifest.assets.find((asset) => asset.id === "arenaRooftopBuilding");
    expect(arena, "arenaRooftopBuilding must stay registered").toBeTruthy();

    const bytes = readFileSync(`apps/aura-clash-showcase/${arena!.outputPath}`);
    const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString("utf8")) as {
      readonly materials?: readonly {
        readonly name?: string;
        readonly pbrMetallicRoughness?: { readonly metallicFactor?: number; readonly baseColorFactor?: readonly number[] };
      }[];
    };
    expect(gltf.materials?.length).toBeGreaterThan(0);
    for (const material of gltf.materials ?? []) {
      const pbr = material.pbrMetallicRoughness ?? {};
      const metallic = pbr.metallicFactor ?? 1;
      expect(metallic, `${material.name} metallicFactor (1.0 renders as a black mirror)`).toBeLessThan(0.5);
      const baseColor = pbr.baseColorFactor;
      expect(baseColor, `${material.name} needs an explicit baseColorFactor`).toBeTruthy();
      // Absent baseColorFactor means white; a stripped-texture material must carry a real colour.
      expect(baseColor!.slice(0, 3).every((channel) => channel < 0.99)).toBe(true);
    }
  });

  it("keeps the arena inside the route draw budget in retained evidence", () => {
    const evidence = JSON.parse(
      readFileSync("apps/aura-clash-showcase/launch-evidence/first-frame.json", "utf8")
    ) as { readonly captures: readonly { readonly rendererDiagnostics: { readonly drawCalls: number | null } | null }[] };
    const drawCalls = evidence.captures[0]?.rendererDiagnostics?.drawCalls ?? 0;
    expect(drawCalls).toBeGreaterThan(0);
    expect(drawCalls, "route draw budget").toBeLessThanOrEqual(160);
  });
});
