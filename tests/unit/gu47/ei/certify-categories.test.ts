import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { certifyGameGeometry } from "../../../../packages/aura3d-cli/src";
import {
  CERTIFY_CATEGORIES,
  CERTIFY_CATEGORY_RULES,
  CERTIFY_CATEGORY_USAGE,
  isCertifyCategory
} from "../../../../packages/aura3d-cli/src/commands/assets/certifyCategories";

// GU47 WP-9 (E-I): `aura3d assets certify-game-geometry --category sports|fighting|arena|puzzle`.

function project(assets: Record<string, unknown>[]) {
  const dir = mkdtempSync(join(tmpdir(), "certify-cat-"));
  mkdirSync(join(dir, "assets"), { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "module" }));
  writeFileSync(join(dir, "aura.assets.json"), JSON.stringify({
    schema: "aura3d.assets/1.0", assetBasePath: "/aura-assets", outputDir: "public/aura-assets", typegen: "src/aura-assets.ts", assets
  }));
  return dir;
}

describe("certify-game-geometry categories (WP-9 E-I)", () => {
  it("accepts the four new categories next to racing and platformer", () => {
    expect([...CERTIFY_CATEGORIES]).toEqual(["racing", "platformer", "sports", "fighting", "arena", "puzzle"]);
    expect(CERTIFY_CATEGORY_USAGE).toBe("racing|platformer|sports|fighting|arena|puzzle");
    for (const c of CERTIFY_CATEGORIES) expect(isCertifyCategory(c)).toBe(true);
    expect(isCertifyCategory("shooter")).toBe(false);
    expect(isCertifyCategory(undefined)).toBe(false);
  });

  it("keeps racing and platformer exactly as before and maps the new categories onto subject and surface certifications", () => {
    expect(CERTIFY_CATEGORY_RULES.racing).toEqual({
      subject: { role: "vehicle", certification: "certified-racing-vehicle", label: "racing-vehicle" },
      surface: { probe: "racing", certification: "certified-racing-track" }
    });
    expect(CERTIFY_CATEGORY_RULES.platformer).toEqual({
      subject: { role: "character", certification: "certified-platformer-character", label: "platformer-character" },
      surface: { probe: "platformer", certification: "certified-platformer-world" }
    });
    expect(CERTIFY_CATEGORY_RULES.sports.subject?.certification).toBe("certified-sports-athlete");
    expect(CERTIFY_CATEGORY_RULES.sports.surface.certification).toBe("certified-sports-venue");
    expect(CERTIFY_CATEGORY_RULES.fighting.surface.certification).toBe("certified-fighting-stage");
    expect(CERTIFY_CATEGORY_RULES.arena.subject?.role).toBe("character");
    expect(CERTIFY_CATEGORY_RULES.puzzle.subject).toBeUndefined();
    for (const c of ["sports", "fighting", "arena", "puzzle"] as const) expect(CERTIFY_CATEGORY_RULES[c].surface.probe).toBe("platformer");
  });

  it("routes a sports athlete through the retained-probe subject rules and refuses without writing the manifest", async () => {
    const dir = project([{ id: "courtAthlete", type: "model", format: "glb", role: "character", quality: "candidate", url: "/aura-assets/courtAthlete.glb", source: "assets/courtAthlete.glb" }]);
    const before = readFileSync(join(dir, "aura.assets.json"), "utf8");
    const result = await certifyGameGeometry({ projectDir: dir, category: "sports", assetId: "courtAthlete" });
    expect(result).toMatchObject({ ok: false, mode: "certify", wroteManifest: false });
    expect(result.rows[0]).toMatchObject({ assetId: "courtAthlete", category: "sports", pass: false });
    expect(result.rows[0]!.blockers.join("\n")).toContain("asset-certification:sports-athlete-");
    expect(readFileSync(join(dir, "aura.assets.json"), "utf8")).toBe(before);
  });

  it("screens unknown ids under any new category without writing", async () => {
    const dir = project([]);
    const result = await certifyGameGeometry({ projectDir: dir, category: "puzzle", assetIds: ["boardA", "boardB"] });
    expect(result).toMatchObject({ ok: false, mode: "screen", wroteManifest: false });
    expect(result.rows.map((r) => [r.category, r.blockers[0]])).toEqual([
      ["puzzle", "asset-extraction:asset-not-found:boardA"],
      ["puzzle", "asset-extraction:asset-not-found:boardB"]
    ]);
  });
});
