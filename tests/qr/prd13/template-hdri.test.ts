// 13-S6 / #1103 follow-up: create-aura3d ships the look HDRIs. Every look
// preset loads /hdri/<file>.hdr (looks.ts HDRI_ASSET); a scaffolded project
// that authors a look must carry them under public/hdri or its IBL/sky 404s.
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { createA3DProject } from "../../../packages/create-aura3d/src";
import { templateAuthorsLook } from "../../../packages/create-aura3d/src/template-hdri";

const rootDir = resolve("packages/create-aura3d");
const hdriSource = join(rootDir, "hdri");
const sha256 = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
const scratch = mkdtempSync(join(tmpdir(), "qr13-template-hdri-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe("create-aura3d template HDRIs", () => {
  test("the package HDRI set is the four Poly Haven files with attribution", () => {
    const files = readdirSync(hdriSource).sort();
    expect(files).toEqual([
      "ATTRIBUTION.md",
      "autumn_field_puresky_1k.hdr",
      "kloppenheim_06_puresky_1k.hdr",
      "night-2k.hdr",
      "studio_small_08_1k.hdr"
    ]);
    const attribution = readFileSync(join(hdriSource, "ATTRIBUTION.md"), "utf8");
    for (const file of files.filter((name) => name.endsWith(".hdr"))) {
      expect(attribution).toContain(`\`${file}\``);
      expect(attribution).toContain(sha256(join(hdriSource, file)));
    }
  });

  test("product-viewer (authors a look) scaffolds public/hdri byte-identical to the source", () => {
    const targetDir = join(scratch, "product-viewer");
    expect(templateAuthorsLook(join(rootDir, "templates", "product-viewer"))).toBe(true);
    const result = createA3DProject({ targetDir, template: "product-viewer", rootDir });
    const shipped = join(targetDir, "public", "hdri", "studio_small_08_1k.hdr");
    expect(existsSync(shipped)).toBe(true);
    expect(sha256(shipped)).toBe(sha256(join(hdriSource, "studio_small_08_1k.hdr")));
    expect(sha256(shipped)).toBe("f6a989f89432eb4eee3191364a9c1ceed195c4ec3544173a3c04fd96cb91d0ba");
    for (const file of readdirSync(hdriSource)) {
      expect(result.files).toContain(`public/hdri/${file}`);
      expect(sha256(join(targetDir, "public", "hdri", file))).toBe(sha256(join(hdriSource, file)));
    }
  });

  test("cinematic-scene (no look authored) gets no public/hdri", () => {
    const targetDir = join(scratch, "cinematic-scene");
    expect(templateAuthorsLook(join(rootDir, "templates", "cinematic-scene"))).toBe(false);
    const result = createA3DProject({ targetDir, template: "cinematic-scene", rootDir });
    expect(existsSync(join(targetDir, "public", "hdri"))).toBe(false);
    expect(result.files.some((file) => file.startsWith("public/hdri/"))).toBe(false);
  });

  test("a look-authoring scaffold fails loudly when the HDRI set is missing", () => {
    // rootDir with templates/ but no hdri/: copy just one template tree.
    const fakeRoot = join(scratch, "fake-root");
    createA3DProject({ targetDir: join(fakeRoot, "templates", "product-viewer"), template: "product-viewer", rootDir });
    rmSync(join(fakeRoot, "templates", "product-viewer", "public", "hdri"), { recursive: true, force: true });
    expect(() =>
      createA3DProject({ targetDir: join(scratch, "broken"), template: "product-viewer", rootDir: fakeRoot })
    ).toThrow(/no look HDRIs found/);
  });
});
