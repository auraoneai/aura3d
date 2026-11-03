import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { createA3DProject, installLookAssets } from "../../../packages/create-aura3d/src/index.js";
import { TEMPLATE_ENVIRONMENT_PRESETS, TEMPLATE_HDRI_SHA256 } from "../../../packages/create-aura3d/src/template-hdri.js";

const packageRoot = resolve("packages/create-aura3d");
const scratch = mkdtempSync(join(tmpdir(), "aura-install-looks-"));
const cli = join(packageRoot, "src/cli.ts");
const tsxLoader = resolve("node_modules/tsx/dist/loader.mjs");
const networkGuard = join(scratch, "no-network.cjs");
writeFileSync(networkGuard, `globalThis.fetch = () => { throw new Error("unexpected network request"); };\n`);

function project(name: string, dependencyField = "dependencies"): string {
  const dir = join(scratch, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name, [dependencyField]: { "@aura3d/engine": "4.7.1" } }));
  return dir;
}

function runCli(cwd: string, ...args: string[]) {
  return spawnSync(process.execPath, ["--require", networkGuard, "--import", tsxLoader, cli, ...args], {
    cwd,
    encoding: "utf8",
    // tsx reads tsconfig `paths` from the cwd, and these runs start in a scratch directory, so
    // `@aura3d/*` imports (the CLI reaches `@aura3d/asset-index`) would resolve through package
    // exports to `dist/`, which the unbuilt 5.0 source-pass unit stage does not have. Point tsx at
    // the workspace source mapping, as vitest's aliases do.
    env: { ...process.env, TSX_TSCONFIG_PATH: resolve("tsconfig.base.json") }
  });
}

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe("installing packaged look assets in an existing project", () => {
  it("adds every verified HDRI, attribution and probe to a scaffold without regenerating it", () => {
    const targetDir = join(scratch, "animation-studio");
    const scaffold = createA3DProject({ targetDir, template: "animation-studio", rootDir: packageRoot });
    expect(scaffold.files.some((file) => file.startsWith("public/hdri/"))).toBe(false);
    const packageBefore = readFileSync(join(targetDir, "package.json"));
    const sourceBefore = readFileSync(join(targetDir, "src/render-live-route.ts"));
    const marker = join(targetDir, "public/keep.txt");
    writeFileSync(marker, "user-owned content\n");

    const result = installLookAssets({ targetDir, rootDir: packageRoot });
    expect(result.targetDir).toBe(resolve(targetDir));
    expect(result.files).toHaveLength(Object.keys(TEMPLATE_HDRI_SHA256).length + 1 + TEMPLATE_ENVIRONMENT_PRESETS.length * 3);
    for (const file of [...Object.keys(TEMPLATE_HDRI_SHA256), "ATTRIBUTION.md"]) {
      expect(result.files).toContain(`public/hdri/${file}`);
      expect(readFileSync(join(targetDir, "public/hdri", file)).equals(readFileSync(join(packageRoot, "hdri", file)))).toBe(true);
    }
    for (const preset of TEMPLATE_ENVIRONMENT_PRESETS) {
      for (const suffix of ["manifest.json", "specular.ktx2", "sh9.f32"]) {
        const file = `${preset}.${suffix}`;
        expect(result.files).toContain(`public/aura-environments/${file}`);
        expect(readFileSync(join(targetDir, "public/aura-environments", file)).equals(readFileSync(join(packageRoot, "aura-environments", file)))).toBe(true);
      }
    }
    expect(readFileSync(join(targetDir, "package.json")).equals(packageBefore)).toBe(true);
    expect(readFileSync(join(targetDir, "src/render-live-route.ts")).equals(sourceBefore)).toBe(true);
    expect(readFileSync(marker, "utf8")).toBe("user-owned content\n");

    const existing = join(targetDir, "public/hdri/autumn_field_puresky_1k.hdr");
    const prior = statSync(existing);
    expect(installLookAssets({ targetDir, rootDir: packageRoot }).files).toEqual(result.files);
    expect(statSync(existing).ino).toBe(prior.ino);
    expect(statSync(existing).mtimeMs).toBe(prior.mtimeMs);
  });

  it("rejects nonexistent or implausible projects without creating asset directories", () => {
    const missing = join(scratch, "missing");
    expect(() => installLookAssets({ targetDir: missing, rootDir: packageRoot })).toThrow();
    expect(existsSync(missing)).toBe(false);

    const invalid: readonly [string, string | undefined][] = [
      ["no-package", undefined],
      ["bad-json", "{"],
      ["not-an-object", "[]"],
      ["other-project", JSON.stringify({ name: "unrelated", dependencies: { vite: "1" } })]
    ];
    for (const [name, contents] of invalid) {
      const dir = join(scratch, name);
      mkdirSync(dir);
      if (contents !== undefined) writeFileSync(join(dir, "package.json"), contents);
      expect(() => installLookAssets({ targetDir: dir, rootDir: packageRoot }), name).toThrow();
      expect(existsSync(join(dir, "public")), name).toBe(false);
    }

    const realProject = project("project-for-links");
    const linkedProject = join(scratch, "linked-project");
    symlinkSync(realProject, linkedProject, "dir");
    expect(() => installLookAssets({ targetDir: linkedProject, rootDir: packageRoot })).toThrow();
    expect(existsSync(join(realProject, "public"))).toBe(false);
    const linkedPackage = join(scratch, "linked-package");
    mkdirSync(linkedPackage);
    symlinkSync(join(realProject, "package.json"), join(linkedPackage, "package.json"), "file");
    expect(() => installLookAssets({ targetDir: linkedPackage, rootDir: packageRoot })).toThrow();
    expect(existsSync(join(linkedPackage, "public"))).toBe(false);
  });

  it("refuses changed packaged images or probe data before writing to a project", () => {
    const tamperedRoot = join(scratch, "tampered-image-source");
    mkdirSync(join(tamperedRoot, "hdri"), { recursive: true });
    const imageName = "autumn_field_puresky_1k.hdr";
    const bytes = readFileSync(join(packageRoot, "hdri", imageName));
    bytes[100] = bytes[100]! ^ 1;
    writeFileSync(join(tamperedRoot, "hdri", imageName), bytes);
    const imageTarget = project("tampered-image-target");
    expect(() => installLookAssets({ targetDir: imageTarget, rootDir: tamperedRoot })).toThrow(/HDRI_INVALID:.*SHA-256 digest mismatch/);
    expect(existsSync(join(imageTarget, "public"))).toBe(false);

    const probeRoot = join(scratch, "tampered-probe-source");
    mkdirSync(join(probeRoot, "aura-environments"), { recursive: true });
    symlinkSync(join(packageRoot, "hdri"), join(probeRoot, "hdri"), "dir");
    const manifest = JSON.parse(readFileSync(join(packageRoot, "aura-environments/studio.manifest.json"), "utf8")) as { sha256: { specular: string } };
    manifest.sha256.specular = "0".repeat(64);
    writeFileSync(join(probeRoot, "aura-environments/studio.manifest.json"), JSON.stringify(manifest));
    symlinkSync(join(packageRoot, "aura-environments/studio.specular.ktx2"), join(probeRoot, "aura-environments/studio.specular.ktx2"), "file");
    const probeTarget = project("tampered-probe-target");
    expect(() => installLookAssets({ targetDir: probeTarget, rootDir: probeRoot })).toThrow(/ENV_PRESET_INVALID:studio:.*digest mismatch/);
    expect(existsSync(join(probeTarget, "public"))).toBe(false);
  });

  it("preserves conflicting files and refuses symlinked destination directories", () => {
    for (const relative of ["public/hdri/hangar_interior_1k.hdr", "public/aura-environments/indoor.sh9.f32"]) {
      const targetDir = project(relative.includes("hdri/") ? "conflict-hdri" : "conflict-probe");
      const conflict = join(targetDir, relative);
      mkdirSync(join(targetDir, "public", relative.includes("hdri/") ? "hdri" : "aura-environments"), { recursive: true });
      writeFileSync(conflict, "user data");
      expect(() => installLookAssets({ targetDir, rootDir: packageRoot })).toThrow(/SCAFFOLD_ASSET_CONFLICT:.*existing file differs/);
      expect(readFileSync(conflict, "utf8")).toBe("user data");
      expect(existsSync(join(targetDir, "public/hdri/autumn_field_puresky_1k.hdr"))).toBe(false);
      expect(existsSync(join(targetDir, "public/aura-environments/studio.manifest.json"))).toBe(false);
    }

    const targetDir = project("linked-target");
    const outside = join(scratch, "outside");
    mkdirSync(join(targetDir, "public"));
    mkdirSync(outside);
    symlinkSync(outside, join(targetDir, "public/hdri"), "dir");
    expect(() => installLookAssets({ targetDir, rootDir: packageRoot })).toThrow(/SCAFFOLD_ASSET_CONFLICT:.*without symlinks/);
    expect(existsSync(join(outside, "autumn_field_puresky_1k.hdr"))).toBe(false);
    expect(existsSync(join(targetDir, "public/aura-environments"))).toBe(false);
  });
});

describe("install-look-assets command", () => {
  it("keeps the existing scaffold command and lists the new command in general help", () => {
    const help = runCli(scratch, "--help");
    expect(help.status, help.stderr).toBe(0);
    expect(help.stdout).toContain("install-look-assets");

    const targetDir = join(scratch, "cli-scaffold");
    const scaffold = runCli(scratch, targetDir, "--template", "cinematic-scene", "--no-agent");
    expect(scaffold.status, scaffold.stderr).toBe(0);
    const result = JSON.parse(scaffold.stdout) as { targetDir: string; template: string };
    expect(result.targetDir).toBe(targetDir);
    expect(result.template).toBe("cinematic-scene");
    expect(existsSync(join(targetDir, "src/main.ts"))).toBe(true);
  }, 120_000);

  it("installs into an explicit path and defaults to the current project, with no network needed", () => {
    const targetDir = project("-project with spaces", "devDependencies");
    const explicit = runCli(scratch, "install-look-assets", targetDir);
    expect(explicit.status, explicit.stderr).toBe(0);
    const result = JSON.parse(explicit.stdout) as { targetDir: string; files: string[] };
    expect(result.targetDir).toBe(targetDir);
    expect(result.files).toContain("public/hdri/ATTRIBUTION.md");
    expect(result.files).toContain("public/aura-environments/studio.specular.ktx2");

    const defaultTarget = runCli(targetDir, "install-look-assets");
    expect(defaultTarget.status, defaultTarget.stderr).toBe(0);
    expect((JSON.parse(defaultTarget.stdout) as { targetDir: string }).targetDir).toBe(realpathSync(targetDir));

    const hyphenTarget = runCli(scratch, "install-look-assets", "--", "-project with spaces");
    expect(hyphenTarget.status, hyphenTarget.stderr).toBe(0);
    expect((JSON.parse(hyphenTarget.stdout) as { targetDir: string }).targetDir).toBe(realpathSync(targetDir));
  }, 120_000);

  it("shows help and rejects unsupported options, extra arguments and invalid targets", () => {
    for (const flag of ["--help", "-h"]) {
      const help = runCli(scratch, "install-look-assets", flag);
      expect(help.status, help.stderr).toBe(0);
      expect(help.stdout).toContain("install-look-assets");
    }
    for (const args of [["--unknown"], ["--template", "product-viewer"], ["one", "two"], [""], ["--help", "--unknown"]]) {
      const result = runCli(scratch, "install-look-assets", ...args);
      expect(result.status, result.stderr).not.toBe(0);
      expect(result.stderr.length).toBeGreaterThan(0);
      expect(existsSync(join(scratch, "one"))).toBe(false);
    }
    const target = join(scratch, "missing-cli-target");
    const invalid = runCli(scratch, "install-look-assets", target);
    expect(invalid.status).not.toBe(0);
    expect(invalid.stderr).toMatch(/project|package\.json|dependency/i);
    expect(existsSync(target)).toBe(false);
  }, 120_000);
});
