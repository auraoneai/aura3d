// Packed-consumer producer for tools/package-clean-install (5.0 decision record
// item 1). npm is replaced by a synthetic runner that installs the staged
// archives; candidate identity checks run for real.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExactReleasePlan } from "../../../tools/release/exact-release-plan.mjs";
import { CREATE_AURA3D_TEMPLATES } from "../../../packages/create-aura3d/src/index";
import { failureLogTail, restorePackedConsumerProject, runPackedSource, validateSourceConsumerReport, type PackedConsumerRunner } from "../../../tools/package-clean-install/index";

const release = vi.hoisted(() => ({ current: null as ExactReleasePlan | null }));
vi.mock("../../../tools/release/exact-release-plan.mjs", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../../tools/release/exact-release-plan.mjs")>(),
  loadValidatedReleasePlan: () => release.current
}));

const sha = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const sri = (bytes: Uint8Array) => `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
const roots: string[] = [];
afterEach(() => { release.current = null; for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function tar(files: Record<string, string | Buffer>): Buffer {
  const chunks: Buffer[] = [];
  for (const [path, data] of Object.entries(files)) {
    const body = Buffer.isBuffer(data) ? data : Buffer.from(data), header = Buffer.alloc(512);
    header.write(`package/${path}`, 0, 100, "utf8");
    header.write("0000644\0", 100, 8, "ascii"); header.write("0000000\0", 108, 8, "ascii"); header.write("0000000\0", 116, 8, "ascii");
    header.write(`${body.length.toString(8).padStart(11, "0")}\0`, 124, 12, "ascii"); header.write("00000000000\0", 136, 12, "ascii");
    header.fill(32, 148, 156); header.write("0", 156, 1, "ascii"); header.write("ustar\0", 257, 6, "ascii");
    header.write(`${header.reduce((sum, value) => sum + value, 0).toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
    chunks.push(header, body, Buffer.alloc((512 - body.length % 512) % 512));
  }
  return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]));
}
/** package.json of a synthetic archive (first tar entry). */
function archiveManifest(bytes: Buffer): { name: string; version: string } {
  const raw = gunzipSync(bytes), size = parseInt(raw.subarray(124, 135).toString("ascii"), 8);
  return JSON.parse(raw.subarray(512, 512 + size).toString("utf8"));
}

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "aura-packed-consumers-")));
  roots.push(root);
  const write = (path: string, data: string | Buffer) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), data); };
  write("pnpm-lock.yaml", "lockfileVersion: '9.0'\n");
  const asset = Buffer.from("large template asset bytes");
  write("packages/create-aura3d/templates/mini-game/public/aura-assets/big.glb", asset);
  const templateAssets = { schema: "create-aura3d/template-assets@1", templates: { "mini-game": [{ path: "public/aura-assets/big.glb", bytes: asset.byteLength, sha256: sha(asset) }] } };
  const specs: [string, Record<string, string | Buffer>, string[]][] = [
    ["@aura3d/asset-index", {}, []],
    ["@aura3d/assets", {}, []],
    ["@aura3d/engine", { "dist/index.js": "export {};" }, []],
    ["@aura3d/react", {}, []],
    ["create-aura3d", { "template-assets.json": JSON.stringify(templateAssets) }, ["@aura3d/asset-index"]]
  ];
  const packages = specs.map(([name, files, internalDependencies]) => {
    const bytes = tar({ "package.json": JSON.stringify({ name, version: "5.0.0" }), ...files });
    const tarball = `candidate/${name.replace("@", "").replace("/", "-")}-5.0.0.tgz`;
    write(tarball, bytes);
    return { name, version: "5.0.0", tarball, sha256: sha(bytes), integrity: sri(bytes), internalDependencies };
  });
  const planBytes = JSON.stringify({ packages });
  write("candidate/plan.json", planBytes);
  const plan = { version: "5.0.0", source: { commit: "c".repeat(40), tree: "t".repeat(40), fingerprint: "a".repeat(64), lockfileSha256: sha("lockfileVersion: '9.0'\n") },
    reference: { path: "candidate/plan.json", sha256: sha(planBytes) }, packages } as ExactReleasePlan;
  release.current = plan;
  return { root, plan };
}

/** Installs file: specs (dependencies + overrides) the way npm lays them out. */
function syntheticRunner(options: { badIntegrity?: string } = {}) {
  const calls: { command: string; args: string[]; cwd: string; manifest?: unknown }[] = [];
  const runner: PackedConsumerRunner = (command, args, cwd) => {
    calls.push({ command, args, cwd, manifest: existsSync(join(cwd, "package.json")) ? JSON.parse(readFileSync(join(cwd, "package.json"), "utf8")) : undefined });
    if (command === "npm" && args[0] === "--version") return { status: 0, output: "10.9.0\n" };
    if (command === process.execPath) {
      const [directory, template] = [args[3]!, args[4]!];
      mkdirSync(join(directory, "src"), { recursive: true });
      const dependencies: Record<string, string> = { "@aura3d/engine": "4.7.10", ...(template === "mini-game" ? { "@aura3d/assets": "4.7.10" } : {}) };
      writeFileSync(join(directory, "package.json"), JSON.stringify({ name: `aura3d-${template}`, private: true, scripts: { build: "vite build" }, dependencies, devDependencies: { vite: "^7.3.2" } }, null, 2));
      writeFileSync(join(directory, template === "animation-studio" ? "src/render-live-route.ts" : "src/main.ts"), 'import "@aura3d/engine";\n');
      return { status: 0, output: "{}" };
    }
    if (command === "npm" && (args[0] === "install" || args[0] === "ci")) {
      const manifest = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8")) as Record<string, Record<string, string> | undefined>;
      const specs = { ...manifest.dependencies, ...manifest.overrides };
      const lock: Record<string, unknown> = { "": { name: "consumer" } };
      for (const spec of Object.values(specs)) {
        if (!spec.startsWith("file:")) continue;
        const bytes = readFileSync(join(cwd, spec.slice(5))), pkg = archiveManifest(bytes);
        mkdirSync(join(cwd, "node_modules", pkg.name), { recursive: true });
        writeFileSync(join(cwd, "node_modules", pkg.name, "package.json"), JSON.stringify(pkg));
        lock[`node_modules/${pkg.name}`] = { version: pkg.version, resolved: spec, integrity: pkg.name === options.badIntegrity ? "sha512-AAAA" : sri(bytes) };
      }
      if (args[0] === "install") writeFileSync(join(cwd, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, packages: lock }, null, 2));
      return { status: 0, output: "installed" };
    }
    if (command === "npm" && args[0] === "run" && args[1] === "build") {
      mkdirSync(join(cwd, "dist"), { recursive: true });
      writeFileSync(join(cwd, "dist/index.html"), "<!doctype html>");
      return { status: 0, output: "built" };
    }
    return { status: 1, output: `unexpected ${command} ${args.join(" ")}` };
  };
  return { runner, calls };
}

describe("packed-consumer clean-install producer", () => {
  it("scaffolds, installs the packed candidate, builds and retains every template plus the React consumer", async () => {
    const f = fixture(), { runner, calls } = syntheticRunner();
    const report = await runPackedSource(f.root, "packed-run", f.plan, runner);
    expect(report.pass).toBe(true);
    expect(report.projects.map(project => project.template)).toEqual([...CREATE_AURA3D_TEMPLATES, "react-import"]);
    expect(report.projects.every(project => project.retention === "packed-v1")).toBe(true);
    expect(report.checks.some(check => check.id === "launcher:install")).toBe(true);
    // No npm process uses host configuration or a lifecycle script.
    for (const call of calls.filter(call => call.command === "npm" && call.args[0] === "install")) {
      expect(call.args).toEqual(expect.arrayContaining(["--ignore-scripts", "--userconfig", "--globalconfig"]));
    }
    const mini = report.projects.find(project => project.template === "mini-game")!;
    expect(mini.substitutions.map(item => [item.section, item.name, item.before])).toEqual([
      ["dependencies", "@aura3d/engine", "4.7.10"], ["dependencies", "@aura3d/assets", "4.7.10"]]);
    expect(readFileSync(join(f.root, mini.path, "public/aura-assets/big.glb"), "utf8")).toBe("large template asset bytes");
    expect(existsSync(join(f.root, mini.path, "node_modules"))).toBe(false);
    expect(mini.installedPackages.map(item => item.name).sort()).toEqual(["@aura3d/assets", "@aura3d/engine"]);
    const react = report.projects.find(project => project.template === "react-import")!;
    expect(react.substitutions.map(item => item.name).sort()).toEqual(["@aura3d/engine", "@aura3d/react"]);
    expect(() => validateSourceConsumerReport(f.root, "tests/reports/native-consumers/packed-run/source.json", f.plan)).not.toThrow();
  });

  it("pins the candidate's internal closure with overrides and records each override", async () => {
    const f = fixture(), { runner, calls } = syntheticRunner();
    await runPackedSource(f.root, "closure-run", f.plan, runner);
    const launcherInstall = calls.find(call => call.command === "npm" && call.args[0] === "install")!;
    expect(launcherInstall.cwd.endsWith("launcher")).toBe(true);
    expect(launcherInstall.manifest).toEqual({ name: "aura3d-scaffold-launcher", private: true, type: "module",
      dependencies: { "create-aura3d": "file:.aura3d-candidate/create-aura3d-5.0.0.tgz" },
      overrides: { "@aura3d/asset-index": "file:.aura3d-candidate/aura3d-asset-index-5.0.0.tgz" } });
  });

  it("rejects a lock entry whose candidate integrity differs from the plan and leaves no report", async () => {
    const f = fixture(), { runner } = syntheticRunner({ badIntegrity: "@aura3d/engine" });
    await expect(runPackedSource(f.root, "bad-lock", f.plan, runner)).rejects.toThrow(/lock identity mismatch/);
    expect(existsSync(join(f.root, "tests/reports/native-consumers/bad-lock"))).toBe(false);
  });

  it("prints the tail of a failing template build in the error so a remote log needs no second download", async () => {
    const f = fixture(), { runner } = syntheticRunner();
    const failing: PackedConsumerRunner = (command, args, cwd, env) => {
      if (command === "npm" && args[0] === "run" && args[1] === "build" && cwd.includes("animation-channel")) {
        return { status: 2, output: [...Array.from({ length: 80 }, (_, index) => `noise ${index + 1}`), "src/main.ts(3,1): error TS2307: Cannot find module 'x'."].join("\n") };
      }
      return runner(command, args, cwd, env);
    };
    const error = await runPackedSource(f.root, "failing-build", f.plan, failing).then(() => null, (cause: unknown) => cause as Error);
    expect(error?.message).toMatch(/^Packed consumer animation-channel:build failed \(log tests\/reports\/native-consumers\/failing-build\/logs\/animation-channel-build\.log\)/);
    expect(error?.message).toContain("--- last 60 of 81 log lines ---");
    expect(error?.message).toContain("    src/main.ts(3,1): error TS2307: Cannot find module 'x'.");
    expect(error?.message).not.toContain("noise 20\n");
  });

  it("keeps only the last lines of a log, indented, and labels short logs whole", () => {
    expect(failureLogTail("a\nb\nc\n", 2)).toBe("--- last 2 of 3 log lines ---\n    b\n    c");
    expect(failureLogTail("only\n")).toBe("--- log ---\n    only");
    expect(failureLogTail("")).toBe("--- log ---\n    ");
  });

  it("rejects a changed candidate archive before staging or installing", async () => {
    const f = fixture(), { runner, calls } = syntheticRunner();
    writeFileSync(join(f.root, f.plan.packages.find(pkg => pkg.name === "@aura3d/engine")!.tarball), "tampered");
    await expect(runPackedSource(f.root, "tampered", f.plan, runner)).rejects.toThrow(/Candidate archive changed: @aura3d\/engine/);
    expect(calls.some(call => call.args.includes("ci"))).toBe(false);
    expect(existsSync(join(f.root, "tests/reports/native-consumers/tampered"))).toBe(false);
  });

  it("rejects a mismatched template asset instead of fabricating it", async () => {
    const f = fixture(), { runner } = syntheticRunner();
    writeFileSync(join(f.root, "packages/create-aura3d/templates/mini-game/public/aura-assets/big.glb"), "other bytes");
    await expect(runPackedSource(f.root, "bad-asset", f.plan, runner)).rejects.toThrow(/Template asset does not match the candidate manifest/);
  });

  it("detects a retained archive, lock or source change at validation", async () => {
    const f = fixture(), { runner } = syntheticRunner();
    const report = await runPackedSource(f.root, "retained-run", f.plan, runner);
    const reportPath = "tests/reports/native-consumers/retained-run/source.json";
    const project = report.projects.find(item => item.template === "product-viewer")!;
    const archive = join(f.root, project.path, ".aura3d-candidate", "aura3d-engine-5.0.0.tgz");
    const original = readFileSync(archive);
    writeFileSync(archive, "tampered");
    expect(() => validateSourceConsumerReport(f.root, reportPath, f.plan)).toThrow(/Consumer project changed|Retained candidate archive changed/);
    writeFileSync(archive, original);
    const lockPath = join(f.root, project.path, "package-lock.json"), lock = readFileSync(lockPath);
    writeFileSync(lockPath, lock.toString().replace(/sha512-[^"]+/, "sha512-BBBB"));
    expect(() => validateSourceConsumerReport(f.root, reportPath, f.plan)).toThrow(/Consumer project changed/);
    writeFileSync(lockPath, lock);
    expect(() => validateSourceConsumerReport(f.root, reportPath, f.plan)).not.toThrow();
  });

  it("restores a retained packed project with a lock-pinned npm ci outside the repository", async () => {
    const f = fixture(), { runner, calls } = syntheticRunner();
    const report = await runPackedSource(f.root, "restore-run", f.plan, runner);
    const project = report.projects.find(item => item.template === "mini-game")!;
    const parent = realpathSync(mkdtempSync(join(tmpdir(), "aura-packed-restore-")));
    roots.push(parent);
    await restorePackedConsumerProject(f.root, project, join(parent, "mini-game"), f.plan, runner);
    expect(calls.at(-1)!.args[0]).toBe("ci");
    expect(calls.at(-1)!.args).toEqual(expect.arrayContaining(["--ignore-scripts", "--userconfig", "--globalconfig"]));
    expect(existsSync(join(parent, "mini-game/node_modules/@aura3d/engine/package.json"))).toBe(true);
    await expect(restorePackedConsumerProject(f.root, project, join(f.root, "inside-repo"), f.plan, runner)).rejects.toThrow(/outside the repository/);
  });
});
