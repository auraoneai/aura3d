/**
 * PRD-02 PR-B: C-39 lane registrations — `environments bake` command and the
 * `migrate lighting` codemod, plus the bake command's KTX2 output contract.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateLightingCodemod } from "../../../../packages/aura3d-cli/src/commands/prd02/migrateLighting.js";
import { runEnvironmentsBake } from "../../../../packages/aura3d-cli/src/commands/prd02/environmentsBake.js";
import { KTX2_MAGIC } from "../../../../packages/rendering/src/lanes/prd02.js";

const io = (): { cwd: string; stdout(s: string): void; stderr(s: string): void; out: string[] } => ({
  cwd: process.cwd(), out: [],
  stdout(s) { this.out.push(s); },
  stderr(s) { this.out.push("ERR " + s); }
});

describe("migrate lighting codemod (C-39)", () => {
  it("maps point/spot intensity → power approximately and notes exact defaults", () => {
    const src = `import { lights } from "@aura3d/engine";\nlights.point({ intensity: 2 });\nlights.spot({ intensity: 1 });\n`;
    const { code, rows } = migrateLightingCodemod.transform(src, "scene.ts");
    expect(code).toContain("lights.point({ power:");
    expect(code).not.toContain("intensity");
    const approx = rows.filter((r) => r.mapping === "approximate");
    expect(approx).toHaveLength(2);
    expect(approx[0]!.construct).toContain("point");
    // point: 2 × 4π ≈ 25 lumens; spot: 1 × π ≈ 3
    expect(code).toMatch(/power: 25/);
    expect(code).toMatch(/power: 3/);
    expect(rows.some((r) => r.mapping === "exact" && r.note?.includes("decay defaults to 2"))).toBe(true);
  });

  it("flags ambient > 1 only when an environment is present", () => {
    const withEnv = `environments.preset("studio");\nlights.ambient({ intensity: 1.5 });\n`;
    const withoutEnv = `lights.ambient({ intensity: 1.5 });\n`;
    const flagged = migrateLightingCodemod.transform(withEnv, "a.ts").rows.filter((r) => r.construct.includes("ambient"));
    expect(flagged).toHaveLength(1);
    expect(flagged[0]!.mapping).toBe("none");
    expect(migrateLightingCodemod.transform(withoutEnv, "b.ts").rows.filter((r) => r.construct.includes("ambient"))).toHaveLength(0);
  });
});

describe("aura3d environments bake (C-39)", () => {
  it("bakes an HDRI source at 128px: 4 mips, 27 SH floats, SH matches projection within 1e-4", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bake-hdr-"));
    const writer = io();
    const rc = await runEnvironmentsBake([
      "--hdr", "fixtures/environment-corpus/hdri/studio_small_08_1k.hdr",
      "--face-size", "128", "--samples", "8", "--out", dir, "--name", "studio-test"
    ], writer);
    expect(rc).toBe(0);
    const manifest = JSON.parse(readFileSync(join(dir, "studio-test.manifest.json"), "utf8"));
    expect(manifest.mipCount).toBe(4);
    const sh9Buf = readFileSync(join(dir, "studio-test.sh9.f32"));
    const sh9File = new Float32Array(sh9Buf.buffer.slice(sh9Buf.byteOffset, sh9Buf.byteOffset + sh9Buf.byteLength));
    expect(sh9File.length).toBe(27);
    // SH of the same cube recomputed from the decode path matches within 1e-4.
    const { decodeHdrEquirect, equirectToCubeFaces, projectCubeToSH9 } = await import("@aura3d/rendering/lanes");
    const img = decodeHdrEquirect(readFileSync("fixtures/environment-corpus/hdri/studio_small_08_1k.hdr"));
    const faces = equirectToCubeFaces(img, 128);
    const sh9 = projectCubeToSH9(faces, 128);
    for (let i = 0; i < 27; i += 1) {
      expect(Math.abs(sh9File[i]! - sh9[i]!)).toBeLessThan(1e-4);
    }
    rmSync(dir, { recursive: true, force: true });
  }, 60000);

  it("bakes a KTX2 specular cube + 27-float SH9 strip + manifest", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bake-"));
    const writer = io();
    const rc = await runEnvironmentsBake(["--source", "room", "--face-size", "32", "--samples", "8", "--out", dir, "--name", "t"], writer);
    expect(rc).toBe(0);
    const ktx2 = readFileSync(join(dir, "t.specular.ktx2"));
    expect(ktx2.subarray(0, 12).equals(KTX2_MAGIC)).toBe(true);
    const sh9 = readFileSync(join(dir, "t.sh9.f32"));
    expect(sh9.byteLength).toBe(27 * 4);
    const manifest = JSON.parse(readFileSync(join(dir, "t.manifest.json"), "utf8"));
    expect(manifest.license).toBe("CC0");
    expect(manifest.format).toBe("E5B9G9R9_UFLOAT_PACK32");
    expect(manifest.sha256.specular).toMatch(/^[0-9a-f]{64}$/);
    rmSync(dir, { recursive: true, force: true });
  }, 30000);
});
