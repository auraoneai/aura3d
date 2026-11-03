import { createHash } from "node:crypto";
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createA3DProject } from "../../../packages/create-aura3d/src/index.js";
import { copyTemplateHdris, TEMPLATE_HDRI_SHA256 } from "../../../packages/create-aura3d/src/template-hdri.js";
import { lookHdriIds, lookHdriUrl } from "../../../packages/engine/src/agent-api/looks/looks.js";

const packageRoot = resolve("packages/create-aura3d");
const packageHdri = join(packageRoot, "hdri");
const scratch = mkdtempSync(join(tmpdir(), "aura-scaffold-hdri-"));
const fixtureHdri = join(scratch, "fixture/hdri");
const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

beforeAll(() => {
  cpSync(packageHdri, fixtureHdri, { recursive: true });
  cpSync(join(packageRoot, "aura-environments"), join(scratch, "fixture/aura-environments"), { recursive: true });
});
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe("scaffolded look HDRI catalogue", () => {
  it("ships every public look URL plus the internal night preset with credited, pinned Radiance data", () => {
    const pkg = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as { files: string[] };
    expect(pkg.files).toContain("hdri");
    expect(lookHdriIds).toHaveLength(17);
    const urls = lookHdriIds.map(lookHdriUrl);
    expect(Object.keys(TEMPLATE_HDRI_SHA256).sort()).toEqual([...urls.map((url) => url.slice("/hdri/".length)), "night-2k.hdr"].sort());

    const attribution = readFileSync(join(packageHdri, "ATTRIBUTION.md"), "utf8");
    for (const [file, expected] of Object.entries(TEMPLATE_HDRI_SHA256)) {
      const data = readFileSync(join(packageHdri, file));
      expect(digest(data), file).toBe(expected);
      expect(data.subarray(0, 11).toString("utf8"), file).toBe("#?RADIANCE\n");
      expect(data.subarray(0, 512).toString("latin1"), file).toMatch(file === "night-2k.hdr" ? /-Y 1024 \+X 2048/ : /-Y 512 \+X 1024/);
      const line = attribution.split("\n").find((entry) => entry.startsWith(`- \`${file}\``));
      expect(line, file).toContain(expected);
      expect(line, file).toContain("CC0-1.0");
    }
    expect(attribution).toMatch(/deep_space_starfield_1k\.hdr` — Aura3D procedural/);
    expect(attribution).toContain("0x8a411208");
  });

  it("copies every selectable image and the attribution into a real look-authoring scaffold", () => {
    const targetDir = join(scratch, "scaffold");
    const result = createA3DProject({ targetDir, template: "product-viewer", rootDir: packageRoot });
    for (const id of lookHdriIds) {
      const url = lookHdriUrl(id);
      const file = url.slice("/hdri/".length);
      const relative = `public${url}`;
      expect(result.files).toContain(relative);
      expect(digest(readFileSync(join(targetDir, relative))), id).toBe(TEMPLATE_HDRI_SHA256[file]);
    }
    for (const file of ["night-2k.hdr", "ATTRIBUTION.md"]) {
      expect(result.files).toContain(`public/hdri/${file}`);
      expect(readFileSync(join(targetDir, "public/hdri", file)).equals(readFileSync(join(packageHdri, file)))).toBe(true);
    }
  });

  it("rejects a missing asset, LFS pointer, modified image, or modified attribution before writing anything", () => {
    const file = "belfast_sunset_puresky_1k.hdr";
    const source = join(fixtureHdri, file);
    const attr = join(fixtureHdri, "ATTRIBUTION.md");
    const scenarios: readonly [string, () => void, RegExp][] = [
      ["missing", () => rmSync(source), /HDRI_UNAVAILABLE:belfast_sunset_puresky_1k\.hdr.*missing/],
      ["pointer", () => writeFileSync(source, `version https://git-lfs.github.com/spec/v1\noid sha256:${TEMPLATE_HDRI_SHA256[file]}\nsize 1215904\n`), /HDRI_UNAVAILABLE:belfast_sunset_puresky_1k\.hdr.*Git LFS pointer/],
      ["tampered", () => { const bytes = readFileSync(source); bytes[100] = bytes[100]! ^ 1; writeFileSync(source, bytes); }, /HDRI_INVALID:belfast_sunset_puresky_1k\.hdr.*SHA-256 digest mismatch/],
      ["attribution", () => writeFileSync(attr, "incorrect license data\n"), /HDRI_INVALID:ATTRIBUTION\.md.*SHA-256 digest mismatch/]
    ];
    for (const [name, damage, expected] of scenarios) {
      const target = join(scratch, `invalid-${name}`);
      try {
        damage();
        expect(() => copyTemplateHdris(fixtureHdri, target), name).toThrow(expected);
        expect(existsSync(join(target, "public")), name).toBe(false);
      } finally {
        copyFileSync(join(packageHdri, file), source);
        copyFileSync(join(packageHdri, "ATTRIBUTION.md"), attr);
      }
    }
  });

  it("accepts attribution with checkout-converted CRLF line endings", () => {
    const attr = join(fixtureHdri, "ATTRIBUTION.md");
    const target = join(scratch, "crlf-attribution");
    try {
      const crlf = readFileSync(attr, "utf8").replace(/\n/g, "\r\n");
      writeFileSync(attr, crlf);
      expect(copyTemplateHdris(fixtureHdri, target)).toContain("public/hdri/ATTRIBUTION.md");
      expect(readFileSync(join(target, "public/hdri/ATTRIBUTION.md"), "utf8")).toBe(crlf);
    } finally {
      copyFileSync(join(packageHdri, "ATTRIBUTION.md"), attr);
    }
  });

  it("preserves conflicting HDRI and probe files and does not partially copy either set", () => {
    for (const relative of ["public/hdri/hangar_interior_1k.hdr", "public/aura-environments/indoor.sh9.f32"]) {
      const target = join(scratch, relative.includes("hdri/") ? "conflict-hdri" : "conflict-probe");
      const conflict = join(target, relative);
      mkdirSync(join(target, "public", relative.includes("hdri/") ? "hdri" : "aura-environments"), { recursive: true });
      writeFileSync(conflict, "user data");
      expect(() => copyTemplateHdris(packageHdri, target)).toThrow(/SCAFFOLD_ASSET_CONFLICT:.*existing file differs/);
      expect(readFileSync(conflict, "utf8")).toBe("user data");
      expect(existsSync(join(target, "public/hdri/autumn_field_puresky_1k.hdr"))).toBe(false);
      expect(existsSync(join(target, "public/aura-environments/studio.manifest.json"))).toBe(false);
    }
  });

  it("retains identical existing files and refuses a symlinked destination directory", () => {
    const target = join(scratch, "identical");
    const existing = join(target, "public/hdri/autumn_field_puresky_1k.hdr");
    mkdirSync(join(target, "public/hdri"), { recursive: true });
    copyFileSync(join(packageHdri, "autumn_field_puresky_1k.hdr"), existing);
    const previous = statSync(existing);
    expect(copyTemplateHdris(packageHdri, target)).toContain("public/hdri/autumn_field_puresky_1k.hdr");
    expect(statSync(existing).mtimeMs).toBe(previous.mtimeMs);
    expect(statSync(existing).ino).toBe(previous.ino);

    const linkedTarget = join(scratch, "linked");
    const outside = join(scratch, "outside");
    mkdirSync(join(linkedTarget, "public"), { recursive: true });
    mkdirSync(outside);
    symlinkSync(outside, join(linkedTarget, "public/hdri"), "dir");
    expect(() => copyTemplateHdris(packageHdri, linkedTarget)).toThrow(/SCAFFOLD_ASSET_CONFLICT:.*expected a directory, without symlinks/);
    expect(existsSync(join(outside, "autumn_field_puresky_1k.hdr"))).toBe(false);
  });
});
