import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { assertInstalledArchiveSet } from "../../../tools/package-clean-install/index";

// Entirely synthetic packages: no package manager, network, or package code runs.
function archive(manifest: Record<string, unknown>, extra: Record<string, string> = {}): Buffer {
  const chunks: Buffer[] = [];
  for (const [path, text] of Object.entries({ "package.json": JSON.stringify(manifest), ...extra })) {
    const bytes = Buffer.from(text), header = Buffer.alloc(512);
    const octal = (value: number, offset: number, length: number) =>
      header.write(`${value.toString(8).padStart(length - 1, "0")}\0`, offset, length, "ascii");
    header.write(`package/${path}`, 0, 100, "utf8");
    octal(0o644, 100, 8); octal(0, 108, 8); octal(0, 116, 8);
    octal(bytes.length, 124, 12); octal(0, 136, 12);
    header.fill(32, 148, 156); header[156] = 48;
    header.write("ustar\0", 257, 6, "ascii"); header.write("00", 263, 2, "ascii");
    octal(header.reduce((sum, byte) => sum + byte, 0), 148, 8);
    chunks.push(header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512));
  }
  return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]));
}

const sri = (bytes: Uint8Array) => `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture(omitOptional = false, bin: string | Record<string, string> = { tool: "bin/tool.js" }) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "aura-npm-installed-custody-")));
  roots.push(root);
  const toolManifest = { name: "tool", version: "1.0.0", bin };
  const otherPlatform = process.platform === "linux" ? "darwin" : "linux";
  const optionalManifest = { name: "optional-tool", version: "1.0.0", os: [otherPlatform] };
  const toolBytes = archive(toolManifest, { "bin/tool.js": "intended\n", "other.js": "also reviewed\n" });
  const optionalBytes = archive(optionalManifest);
  const toolResolved = "https://registry.npmjs.org/tool/-/tool-1.0.0.tgz";
  const optionalResolved = "https://registry.npmjs.org/optional-tool/-/optional-tool-1.0.0.tgz";
  const lock = { lockfileVersion: 3, packages: {
    "": { name: "consumer", dependencies: { tool: "1.0.0" }, optionalDependencies: { "optional-tool": "1.0.0" } },
    "node_modules/tool": { version: "1.0.0", resolved: toolResolved, integrity: sri(toolBytes) },
    "node_modules/optional-tool": { version: "1.0.0", resolved: optionalResolved, integrity: sri(optionalBytes), optional: true, os: [otherPlatform] }
  } };
  const archives = [{ resolved: toolResolved, path: "tool.tgz" }, { resolved: optionalResolved, path: "optional.tgz" }];
  const source = new Map([["tool.tgz", toolBytes], ["optional.tgz", optionalBytes]]);
  const put = (path: string, bytes: string) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes); };
  const modules = join(root, "node_modules"), tool = join(modules, "tool");
  put(join(tool, "package.json"), JSON.stringify(toolManifest));
  put(join(tool, "bin/tool.js"), "intended\n");
  put(join(tool, "other.js"), "also reviewed\n");
  if (!omitOptional) put(join(modules, "optional-tool/package.json"), JSON.stringify(optionalManifest));
  mkdirSync(join(modules, ".bin"));
  symlinkSync("../tool/bin/tool.js", join(modules, ".bin/tool"));
  const verify = () => assertInstalledArchiveSet(root, lock, archives, path => source.get(path)!);
  return { root, modules, tool, lock, archives, source, verify };
}

describe("npm installed-tree custody", () => {
  it("checks a complete tree with the bin pointing to its declared target", () => {
    expect(fixture().verify()).toMatchObject({
      archiveAdmissionBound: false, installationAuthorized: false, executionAuthorized: false
    });
  });

  it("resolves string bin declarations to their exact package-local target", () => {
    expect(fixture(false, "./bin/tool.js").verify().packagePaths).toContain("node_modules/tool");
    expect(fixture(false, "../other.js").verify).toThrow(/unsafe npm bin target/);
  });

  it("does not silently omit an optional package without authenticated installer platform custody", () => {
    expect(fixture(true).verify).toThrow(/optional|platform|missing/i);
  });

  it("rejects a command redirected to another reviewed file in the same archive", () => {
    const f = fixture(), bin = join(f.modules, ".bin/tool");
    rmSync(bin);
    symlinkSync("../tool/other.js", bin);
    expect(f.verify).toThrow(/bin|executable|target/i);
  });

  it("rejects an undeclared executable name even if its target is reviewed", () => {
    const f = fixture();
    symlinkSync("../tool/bin/tool.js", join(f.modules, ".bin/unlisted"));
    expect(f.verify).toThrow(/bin|executable|undeclared/i);
  });

  it("rejects a missing declared command rather than silently accepting an incomplete .bin", () => {
    const f = fixture();
    rmSync(join(f.modules, ".bin/tool"));
    expect(f.verify).toThrow(/bin.*incomplete/i);
    rmSync(join(f.modules, ".bin"), { recursive: true });
    expect(f.verify).toThrow(/bin.*missing/i);
  });

  it("refuses a self-declared loopback archive route without sealed dispatcher authority", () => {
    const f = fixture(), url = `http://127.0.0.1:49152/-/tarballs/${"a".repeat(64)}`;
    f.lock.packages["node_modules/tool"].resolved = url;
    f.archives[0].resolved = url;
    expect(f.verify).toThrow(/loopback.*sealed dispatcher/i);
  });

  it("does not treat a caller-created object as an archive admission capability", () => {
    const f = fixture();
    expect(() => assertInstalledArchiveSet(f.root, f.lock, f.archives, path => f.source.get(path)!, {
      capability: {} as never, manifestBytes: Buffer.from('{"name":"consumer"}'),
      lockBytes: Buffer.from(JSON.stringify(f.lock))
    })).toThrow(/invalid admission capability/);
  });
});
