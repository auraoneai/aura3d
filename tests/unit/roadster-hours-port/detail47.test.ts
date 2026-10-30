import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DETAIL_ASSETS } from "../../../examples/roadster-hours-port/art/detail";
import { SALTWIND_LOOK } from "../../../examples/roadster-hours-port/art/look";
import { ORIGINAL_LOOKS, lookFromRow } from "../../../examples/roadster-hours-port/look";
import { detailAmount, rockDetailKey, roadSpec, terrainSpec } from "../../../examples/roadster-hours-port/materials";
import { ROAD_FRAGMENT, TERRAIN_FRAGMENT } from "../../../examples/roadster-hours-port/shaders";

const dir = resolve("examples/roadster-hours-port/assets/detail");
const index = JSON.parse(readFileSync(resolve(dir, "detail.json"), "utf8")) as Record<string, { file: string; sha256: string; bytes: number; source: { license: string } }>;

describe("Saltwind Highway CC0 surface detail (RH47-10)", () => {
  it("every detail map is CC0, hashed as committed and inside the texture budget", () => {
    let bytes = 0;
    for (const [key, ref] of Object.entries(DETAIL_ASSETS)) {
      const row = index[key]!;
      const file = readFileSync(resolve(dir, row.file));
      bytes += file.length;
      expect(row.source.license).toBe("CC0-1.0");
      expect(ref.hash).toBe(`sha256-${createHash("sha256").update(file).digest("hex")}`);
      expect(ref.url).toMatch(new RegExp(`/assets/detail/${key}\\.jpg$`));
    }
    expect(bytes).toBeLessThan(24 * 1024 * 1024);
  });

  it("road and terrain bind the route's detail set; the original look keeps it off", () => {
    const sunbreak = lookFromRow(SALTWIND_LOOK.sunbreak), redline = lookFromRow(SALTWIND_LOOK.redline);
    expect(rockDetailKey(sunbreak)).toBe("limestone");
    expect(rockDetailKey(redline)).toBe("sandstone");
    expect((terrainSpec(redline).uniforms as Record<string, { value: unknown }>).rockDetail!.value).toBe(DETAIL_ASSETS.sandstone);
    expect((roadSpec(sunbreak, [1, 1, 1], [0, 0, 0]).uniforms as Record<string, { value: unknown }>).roadDetail!.value).toBe(DETAIL_ASSETS.asphalt);
    expect(detailAmount(sunbreak)).toBeGreaterThan(0);
    for (const look of Object.values(ORIGINAL_LOOKS)) {
      expect(detailAmount(look)).toBe(0);
      expect((terrainSpec(look).uniforms as Record<string, { value: number }>).detailAmt!.value).toBe(0);
    }
  });

  it("each tap fades by its texel footprint before it can alias", () => {
    for (const glsl of [ROAD_FRAGMENT, TERRAIN_FRAGMENT]) {
      expect(glsl).toContain("smoothstep(0.75, 2.0, texels)");
      expect(glsl).toContain("detailAmt > 0.0");
    }
  });
});

describe("Saltwind Highway galvanised guardrails (RH47-10)", () => {
  it("the guardrails carry the spangle on the GU47 look only", async () => {
    const { buildWorld } = await import("../../../examples/roadster-hours-port/world");
    const find = (node: unknown): unknown => {
      if (!node || typeof node !== "object") return undefined;
      const n = node as { name?: string; material?: { custom?: { uniforms?: { spangle?: { value: number } } } } };
      if (n.name === "guardrails") return n.material?.custom?.uniforms?.spangle?.value;
      for (const child of Object.values(node)) { const hit = find(child); if (hit !== undefined) return hit; }
      return undefined;
    };
    const rails = (mode: "gu47" | "original") => find(buildWorld(0, mode).scene.toJSON());
    expect(rails("gu47")).toBe(1);
    expect(rails("original")).toBe(0);
  });
});
