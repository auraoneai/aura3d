// Packed matrix producer (5.0 decision record item 1): ordinary isolated
// packed-consumer installs per cell. Package managers are replaced by a
// synthetic runner; candidate archive and lock identity checks run for real.
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CHECK_IDS, matrixCells, packedInstallCommand, packedRestoreCommand, runPackedMatrixSource, type MatrixCell, type PackedMatrixRunner } from "../../../tools/native-consumer-matrix/index";

const sha = (bytes: string | Buffer): string => createHash("sha256").update(bytes).digest("hex");
const sri = (bytes: Buffer): string => `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

const NAMES = ["@aura3d/engine", "@aura3d/react", "@aura3d/assets", "@aura3d/input", "@aura3d/controls", "@aura3d/navigation-recast"];
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "matrix-packed-")));
  roots.push(root);
  const write = (path: string, bytes: string | Buffer) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), bytes); };
  for (const name of ["conditions.mjs", "javascript-esm.mjs", "optional-peer-absent.mjs", "optional-peer-present.mjs", "react-client.tsx", "react-ssr.tsx", "typescript-bundler.ts", "typescript-nodenext.ts"]) {
    mkdirSync(join(root, "tests/fixtures/native-consumer"), { recursive: true });
    copyFileSync(resolve("tests/fixtures/native-consumer", name), join(root, "tests/fixtures/native-consumer", name));
  }
  write("pnpm-lock.yaml", "lockfileVersion: '9.0'\n");
  const packages = NAMES.map(name => {
    const bytes = Buffer.from(`synthetic archive ${name}`), tarball = `candidate/${name.slice(1).replace("/", "-")}-5.0.0.tgz`;
    write(tarball, bytes);
    return { name, version: "5.0.0", tarball, sha256: sha(bytes), integrity: sri(bytes), internalDependencies: [] as string[] };
  });
  write("candidate/plan.json", JSON.stringify({ schema: "aura3d-release-plan/1.0", version: "5.0.0",
    source: { commit: "c".repeat(40), fingerprint: "a".repeat(64), lockfileSha256: sha("lockfileVersion: '9.0'\n") }, packages }));
  return { root, packages };
}

/** Lays out the cell's file: candidates and pinned third-party versions; vite is not real, so browser-build fails. */
function runner(options: { wrongIntegrity?: string } = {}) {
  const calls: { command: string[]; cwd: string }[] = [];
  const run: PackedMatrixRunner = (command, cwd) => {
    calls.push({ command, cwd });
    if (command[1] === "--version") return { exitCode: 0, output: command[0] === "npm" ? "10.9.0" : "10.20.0" };
    const install = JSON.stringify(command) === JSON.stringify(packedInstallCommand({ manager: command[0] as MatrixCell["manager"] } as MatrixCell));
    if (install) {
      const manifest = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8")) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
      const lock: Record<string, unknown> = { "": {} };
      let pnpm = "lockfileVersion: '9.0'\n\npackages:\n\n";
      for (const [name, spec] of Object.entries({ ...manifest.dependencies, ...manifest.devDependencies })) {
        const version = spec.startsWith("file:") ? "5.0.0" : spec.replace(/^\^/, "");
        mkdirSync(join(cwd, "node_modules", name), { recursive: true });
        writeFileSync(join(cwd, "node_modules", name, "package.json"), JSON.stringify({ name, version }));
        if (!spec.startsWith("file:")) continue;
        const bytes = readFileSync(join(cwd, spec.slice(5))), integrity = name === options.wrongIntegrity ? "sha512-AAAA" : sri(bytes);
        lock[`node_modules/${name}`] = { version, resolved: spec.replace("file:./", "file:"), integrity };
        pnpm += `  '${name}@file:tarballs/${basename(spec)}':\n    resolution: {integrity: ${integrity}, tarball: file:tarballs/${basename(spec)}}\n    version: 5.0.0\n\n`;
      }
      if (command[0] === "npm") writeFileSync(join(cwd, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, packages: lock }));
      else writeFileSync(join(cwd, "pnpm-lock.yaml"), pnpm);
      return { exitCode: 0, output: "installed" };
    }
    if (command[0].endsWith("vite")) return { exitCode: 0, output: "no build output" };
    return { exitCode: 0, output: "probe ok" };
  };
  return { run, calls };
}

describe("packed consumer matrix producer", () => {
  it("installs every npm/pnpm x React x peer cell from the candidate archives and runs every probe", async () => {
    const f = fixture(), { run, calls } = runner();
    const report = await runPackedMatrixSource(f.root, "packed-matrix", "candidate/plan.json", run);
    expect(report.projects.map(project => project.id)).toEqual(matrixCells().map(cell => cell.id));
    expect(report.projects.every(project => project.retention === "packed-v1")).toBe(true);
    expect(report.checks).toHaveLength(matrixCells().length * CHECK_IDS.length);
    for (const cell of matrixCells()) {
      const cellChecks = report.checks.filter(check => check.project === cell.id);
      expect(cellChecks.find(check => check.id === "install")).toMatchObject({ status: "pass", command: packedInstallCommand(cell) });
      expect(cellChecks.find(check => check.id === "installed-identity")?.status).toBe("pass");
      for (const id of ["javascript-esm", "condition-node", "condition-browser", "typescript-nodenext", "typescript-bundler", "react-ssr", "optional-peer"]) {
        expect(cellChecks.find(check => check.id === id)?.status).toBe("pass");
      }
      // The synthetic vite emits no bundle, so the worker-asset assertion must fail the cell.
      expect(cellChecks.find(check => check.id === "browser-build")?.status).toBe("fail");
      const retained = join(f.root, "tests/reports/native-consumer-matrix/packed-matrix/projects", cell.id);
      expect(existsSync(join(retained, "node_modules"))).toBe(false);
      for (const pkg of f.packages.filter(pkg => pkg.name !== "@aura3d/navigation-recast" || cell.peer === "present")) {
        expect(sha(readFileSync(join(retained, "tarballs", basename(pkg.tarball))))).toBe(pkg.sha256);
      }
    }
    expect(report.status).toBe("fail");
    expect(existsSync(join(f.root, "tests/reports/native-consumers/packed-matrix/matrix-source.json"))).toBe(true);
    expect(calls.some(call => call.command.includes("--offline"))).toBe(false);
  });

  it("fails a cell whose lock does not pin the candidate integrity and skips its probes", async () => {
    const f = fixture(), { run } = runner({ wrongIntegrity: "@aura3d/engine" });
    const report = await runPackedMatrixSource(f.root, "bad-lock", "candidate/plan.json", run);
    for (const cell of matrixCells()) {
      const install = report.checks.find(check => check.project === cell.id && check.id === "install")!;
      expect(install.status).toBe("fail");
      expect(readFileSync(join(f.root, install.logPath), "utf8")).toMatch(/integrity mismatch|Non-candidate/);
      expect(report.checks.filter(check => check.project === cell.id && check.status === "not-run")).toHaveLength(CHECK_IDS.length - 1);
    }
    expect(report.status).toBe("fail");
  });

  it("refuses a changed candidate archive before any package manager runs", async () => {
    const f = fixture(), { run, calls } = runner();
    writeFileSync(join(f.root, f.packages[0]!.tarball), "tampered");
    await expect(runPackedMatrixSource(f.root, "tampered", "candidate/plan.json", run)).rejects.toThrow(/Candidate archive mismatch/);
    expect(calls).toHaveLength(0);
  });

  it("restores with a frozen lock-pinned install", () => {
    for (const cell of matrixCells()) {
      const restore = packedRestoreCommand(cell);
      expect(restore).toContain("--ignore-scripts");
      expect(restore).toContain(cell.manager === "npm" ? "ci" : "--frozen-lockfile");
    }
  });
});
