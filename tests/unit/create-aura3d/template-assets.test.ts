import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CREATE_AURA3D_TEMPLATES,
  createA3DProject,
  fetchMissingTemplateAssets,
  fetchTemplateAssets,
  missingTemplateAssets,
  readTemplateAssetManifest,
  templateAssetBases,
  type TemplateAssetManifest
} from "../../../packages/create-aura3d/src/index";

const PKG = resolve("packages/create-aura3d");
const dirs: string[] = [];
const temp = () => { const d = mkdtempSync(join(tmpdir(), "tpl-assets-")); dirs.push(d); return d; };
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const okResponse = (bytes: Uint8Array) => ({ ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer });

describe("create-aura3d on-demand template assets (audit RH-14)", () => {
  it("the shipped manifest matches the template files on disk (sizes and sha256)", () => {
    const manifest = readTemplateAssetManifest(PKG)!;
    expect(manifest.schema).toBe("create-aura3d/template-assets@1");
    let count = 0;
    for (const [template, entries] of Object.entries(manifest.templates)) {
      expect(CREATE_AURA3D_TEMPLATES as readonly string[]).toContain(template);
      for (const entry of entries) {
        const file = join(PKG, "templates", template, entry.path);
        expect(existsSync(file), file).toBe(true);
        expect(statSync(file).size).toBe(entry.bytes);
        expect(sha(readFileSync(file))).toBe(entry.sha256);
        count++;
      }
    }
    expect(count).toBeGreaterThan(0);
    execFileSync(process.execPath, ["tools/create-aura3d/template-assets.mjs", "--check"]);
  });

  it("package.json excludes exactly the manifest files from the tarball and ships the manifest", () => {
    const pkg = JSON.parse(readFileSync(join(PKG, "package.json"), "utf8")) as { files: string[] };
    const manifest = readTemplateAssetManifest(PKG)!;
    const expected = Object.entries(manifest.templates).flatMap(([t, es]) => es.map((e) => `!templates/${t}/${e.path}`)).sort();
    expect(pkg.files.filter((f) => f.startsWith("!templates/") && !f.includes("*")).filter((f) => f !== "!templates/**/__on-demand-assets__").sort()).toEqual(expected);
    expect(pkg.files).toContain("template-assets.json");
  });

  it("a source-checkout scaffold has every asset, so nothing is fetched", () => {
    const result = createA3DProject({ targetDir: join(temp(), "app"), template: "fighting-game", rootDir: PKG });
    expect(result.missingAssets).toEqual([]);
  });

  it("a scaffold from the packed layout reports the missing files, and the fetch restores them byte for byte", async () => {
    // Simulate the npm tarball: copy the package root without the manifest files.
    const root = temp();
    const manifest = readTemplateAssetManifest(PKG)!;
    const template = "racing-starter";
    const excluded = new Set(manifest.templates[template]!.map((e) => e.path));
    const copy = (from: string, to: string) => {
      for (const entry of readdirSync(from, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name === "dist") continue;
        const src = join(from, entry.name), dst = join(to, entry.name);
        if (entry.isDirectory()) { mkdirSync(dst, { recursive: true }); copy(src, dst); continue; }
        if (excluded.has(relative(join(PKG, "templates", template), src).split("\\").join("/"))) continue;
        writeFileSync(dst, readFileSync(src));
      }
    };
    for (const t of CREATE_AURA3D_TEMPLATES) { mkdirSync(join(root, "templates", t), { recursive: true }); if (t === template) copy(join(PKG, "templates", t), join(root, "templates", t)); else writeFileSync(join(root, "templates", t, "package.json"), "{}"); }
    mkdirSync(join(root, "hdri"));
    copy(join(PKG, "hdri"), join(root, "hdri"));
    writeFileSync(join(root, "template-assets.json"), readFileSync(join(PKG, "template-assets.json")));

    const result = createA3DProject({ targetDir: join(root, "out"), template, rootDir: root });
    expect(result.missingAssets.map((e) => e.path).sort()).toEqual([...excluded].sort());

    const urls: string[] = [];
    const fetched = await fetchMissingTemplateAssets(result, {
      version: "4.5.0",
      bases: ["https://example.invalid/aura3d@v{version}/packages/create-aura3d"],
      fetch: async (url) => {
        urls.push(url);
        const path = url.split(`/templates/${template}/`)[1]!;
        return okResponse(readFileSync(join(PKG, "templates", template, path)));
      }
    });
    expect(fetched.failed).toEqual([]);
    expect(urls[0]).toMatch(/^https:\/\/example\.invalid\/aura3d@v4\.5\.0\/packages\/create-aura3d\/templates\/racing-starter\//);
    for (const entry of result.missingAssets) expect(sha(readFileSync(join(result.targetDir, entry.path)))).toBe(entry.sha256);
    expect(missingTemplateAssets(manifest, template, result.targetDir)).toEqual([]);
  });

  it("never writes a file whose size or sha256 does not match, and falls through to the next base", async () => {
    const projectDir = temp();
    const good = new Uint8Array([1, 2, 3, 4]);
    const entries = [{ path: "public/aura-assets/a.glb", bytes: 4, sha256: sha(good) }];
    const tampered = await fetchTemplateAssets({ projectDir, template: "t", entries, version: "1.0.0", bases: ["https://a.invalid"], fetch: async () => okResponse(new Uint8Array([9, 9, 9, 9])) });
    expect(tampered.fetched).toEqual([]);
    expect(tampered.failed[0]!.reasons[0]).toMatch(/sha256/);
    expect(existsSync(join(projectDir, "public/aura-assets/a.glb"))).toBe(false);

    const seen: string[] = [];
    const second = await fetchTemplateAssets({
      projectDir, template: "t", entries, version: "1.0.0", bases: ["https://a.invalid", "https://b.invalid"],
      fetch: async (url) => { seen.push(url); return url.startsWith("https://a.") ? { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) } : okResponse(good); }
    });
    expect(seen).toEqual(["https://a.invalid/templates/t/public/aura-assets/a.glb", "https://b.invalid/templates/t/public/aura-assets/a.glb"]);
    expect(second.failed).toEqual([]);
    expect([...readFileSync(join(projectDir, "public/aura-assets/a.glb"))]).toEqual([1, 2, 3, 4]);
  });

  it("rejects manifest paths that escape the project", async () => {
    const r = await fetchTemplateAssets({ projectDir: temp(), template: "t", entries: [{ path: "../evil.glb", bytes: 1, sha256: "x" }], version: "1", bases: ["https://a.invalid"], fetch: async () => { throw new Error("must not fetch"); } });
    expect(r.failed[0]!.reasons).toEqual(["unsafe path in manifest"]);
  });

  it("AURA3D_TEMPLATE_ASSET_BASE replaces the default hosts", () => {
    expect(templateAssetBases({})[0]).toMatch(/^https:\/\/raw\.githubusercontent\.com\/auraoneai\/aura3d\/v\{version\}\//);
    expect(templateAssetBases({ AURA3D_TEMPLATE_ASSET_BASE: "https://m1 https://m2" })).toEqual(["https://m1", "https://m2"]);
  });

  it("an empty manifest reports nothing missing", () => {
    const empty: TemplateAssetManifest = { schema: "create-aura3d/template-assets@1", templates: {} };
    expect(missingTemplateAssets(empty, "mini-game", temp())).toEqual([]);
    expect(missingTemplateAssets(null, "mini-game", temp())).toEqual([]);
  });
});
