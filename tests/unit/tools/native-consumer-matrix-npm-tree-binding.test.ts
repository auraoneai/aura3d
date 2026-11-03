import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const subprocesses = vi.hoisted(() => ({
  spawnSync: vi.fn(() => { throw new Error("unexpected matrix subprocess"); }),
  execFileSync: vi.fn(() => { throw new Error("unexpected matrix subprocess"); })
}));
vi.mock("node:child_process", async importOriginal => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  ...subprocesses
}));

import { BROWSERS, CHECK_IDS, matrixCells, verifyMatrixInstalledNpmProject } from "../../../tools/native-consumer-matrix/index";
import * as npmGraph from "../../../tools/release/portable-npm-lock.mjs";
import * as cleanInstall from "../../../tools/package-clean-install/index";

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const projectDir = mkdtempSync(join(tmpdir(), "matrix-npm-tree-binding-"));
  roots.push(projectDir);
  const manifestBytes = Buffer.from('{"name":"untrusted-test"}');
  const lockBytes = Buffer.from('{"lockfileVersion":3,"packages":{"":{}}}');
  writeFileSync(join(projectDir, "package.json"), manifestBytes);
  writeFileSync(join(projectDir, "package-lock.json"), lockBytes);
  mkdirSync(join(projectDir, "node_modules"));
  // This is deliberately NOT a capability. The graph check is stubbed only to
  // exercise the next independent boundary; no passing observation is minted.
  const admission = { capability: {} as never, manifestBytes, lockBytes };
  const readArchive = () => { throw new Error("unexpected archive read"); };
  return { projectDir, admission, archives: [], readArchive, candidatePackages: [] };
}

describe("matrix npm installed-tree admission binding", () => {
  it("keeps the complete source and deferred browser inventories", () => {
    const cells = matrixCells();
    expect(cells.map(cell => cell.id)).toEqual([
      "npm-react18-peer-absent", "npm-react18-peer-present",
      "npm-react19-peer-absent", "npm-react19-peer-present",
      "pnpm-react18-peer-absent", "pnpm-react18-peer-present",
      "pnpm-react19-peer-absent", "pnpm-react19-peer-present"
    ]);
    expect(CHECK_IDS).toEqual([
      "install", "installed-identity", "javascript-esm", "condition-node", "condition-browser",
      "typescript-nodenext", "typescript-bundler", "react-ssr", "optional-peer", "browser-build"
    ]);
    expect(BROWSERS).toEqual(["chromium", "firefox", "webkit"]);
    expect(new Set(cells.flatMap(cell => CHECK_IDS.map(id => `${cell.id}/${id}`))).size).toBe(80);
    expect(new Set(cells.flatMap(cell => BROWSERS.map(id => `${cell.id}/${id}`))).size).toBe(24);
  });

  it("rejects a forged admission even if an earlier graph check is stubbed", () => {
    const input = fixture();
    const graph = vi.spyOn(npmGraph, "assertIndependentNpmConsumer").mockReturnValue({ inputPaths: [] });

    expect(() => verifyMatrixInstalledNpmProject(input)).toThrow(/invalid admission capability/);
    expect(graph).toHaveBeenCalledTimes(1);
    expect(subprocesses.spawnSync).not.toHaveBeenCalled();
    expect(subprocesses.execFileSync).not.toHaveBeenCalled();
  });

  it("forwards the very same admission to the installed-tree verifier and propagates its failure", () => {
    const input = fixture();
    vi.spyOn(npmGraph, "assertIndependentNpmConsumer").mockReturnValue({ inputPaths: [] });
    const installed = vi.spyOn(cleanInstall, "assertInstalledArchiveSet").mockImplementation(() => {
      throw new Error("synthetic installed-tree rejection");
    });

    expect(() => verifyMatrixInstalledNpmProject(input)).toThrow(/synthetic installed-tree rejection/);
    expect(installed).toHaveBeenCalledTimes(1);
    expect(installed.mock.calls[0][4]).toBe(input.admission);
    expect(subprocesses.spawnSync).not.toHaveBeenCalled();
    expect(subprocesses.execFileSync).not.toHaveBeenCalled();
  });
});
