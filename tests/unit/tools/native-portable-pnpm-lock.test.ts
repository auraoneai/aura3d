import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";

const admissionMock = vi.hoisted(() => ({ enabled: false, capability: {} as object,
  archives: [] as { resolved: string; bytes: Uint8Array }[], onConsume: undefined as undefined | (() => void) }));
vi.mock("../../../tools/release/archive-admission.mjs", async importOriginal => {
  const actual = await importOriginal<typeof import("../../../tools/release/archive-admission.mjs")>();
  return { ...actual, consumePnpmArchiveAdmission(input: Parameters<typeof actual.consumePnpmArchiveAdmission>[0]) {
    if (admissionMock.enabled && input.capability === admissionMock.capability) {
      admissionMock.onConsume?.();
      return admissionMock.archives.map(item => ({ resolved: item.resolved, bytes: Uint8Array.from(item.bytes) }));
    }
    return actual.consumePnpmArchiveAdmission(input);
  } };
});
import {
  assertIndependentPnpmConsumer,
  assertInstalledPnpmArchiveSet,
  inspectIndependentPnpmConsumer,
  seedVerifiedPnpmStore,
  type PnpmInspectionInput
} from "../../../tools/release/portable-pnpm-lock.mjs";

const digest = (algorithm: string, bytes: Uint8Array, encoding: "hex" | "base64") =>
  createHash(algorithm).update(bytes).digest(encoding);
const integrity = (bytes: Uint8Array) => `sha512-${digest("sha512", bytes, "base64")}`;

/** Synthetic tar creation is in memory and never invokes a package manager. */
function archive(manifest: Record<string, unknown>, extra: Record<string, string> = {}): Buffer {
  const chunks: Buffer[] = [];
  for (const [path, text] of Object.entries({ "package.json": JSON.stringify(manifest), ...extra })) {
    const data = Buffer.from(text), header = Buffer.alloc(512);
    const octal = (value: number, offset: number, length: number) =>
      header.write(`${value.toString(8).padStart(length - 1, "0")}\0`, offset, length, "ascii");
    header.write(`package/${path}`, 0, 100, "utf8");
    octal(0o644, 100, 8); octal(0, 108, 8); octal(0, 116, 8);
    octal(data.length, 124, 12); octal(0, 136, 12);
    header.fill(32, 148, 156); header[156] = 48;
    header.write("ustar\0", 257, 6, "ascii"); header.write("00", 263, 2, "ascii");
    octal(header.reduce((sum, byte) => sum + byte, 0), 148, 8);
    chunks.push(header, data, Buffer.alloc((512 - data.length % 512) % 512));
  }
  return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]));
}

function fixture(options: { bundled?: boolean; bin?: boolean; optionalOs?: string } = {}) {
  const candidateManifest = { name: "@aura3d/engine", version: "1.2.3", ...(options.bundled ? { bundledDependencies: ["embedded"] } : {}) };
  const utilManifest = { name: "util", version: "1.2.0", peerDependencies: { "peer-lib": "^2.0.0" },
    optionalDependencies: { "optional-lib": "~3.2.0" }, ...(options.bin ? { bin: { utilcmd: "bin/util.js" } } : {}) };
  const peerManifest = { name: "peer-lib", version: "2.0.0" };
  const optionalManifest = { name: "optional-lib", version: "3.2.1", ...(options.optionalOs ? { os: [options.optionalOs] } : {}) };
  const candidateBytes = archive(candidateManifest);
  const utilBytes = archive(utilManifest, options.bin ? { "bin/util.js": "#!/usr/bin/env node\nexport const fixture = 1;\n" } : {});
  const peerBytes = archive(peerManifest);
  const optionalBytes = archive(optionalManifest);
  const source = new Map<string, Buffer>([
    ["archives/engine.tgz", candidateBytes], ["archives/util.tgz", utilBytes],
    ["archives/peer.tgz", peerBytes], ["archives/optional.tgz", optionalBytes]
  ]);
  const manifest = {
    name: "consumer", version: "0.0.0", private: true,
    dependencies: { "@aura3d/engine": "file:./tarballs/aura3d-engine.tgz", "util-alias": "npm:util@^1.0.0" }
  };
  const lock = `lockfileVersion: '9.0'
settings:
  autoInstallPeers: true
  excludeLinksFromLockfile: false
importers:
  .:
    dependencies:
      '@aura3d/engine':
        specifier: file:./tarballs/aura3d-engine.tgz
        version: file:tarballs/aura3d-engine.tgz
      util-alias:
        specifier: npm:util@^1.0.0
        version: util@1.2.0(peer-lib@2.0.0)
packages:
  '@aura3d/engine@file:tarballs/aura3d-engine.tgz':
    resolution: {integrity: ${integrity(candidateBytes)}, tarball: file:tarballs/aura3d-engine.tgz}
  util@1.2.0:
    resolution: {integrity: ${integrity(utilBytes)}}
    peerDependencies:
      peer-lib: ^2.0.0
  peer-lib@2.0.0:
    resolution: {integrity: ${integrity(peerBytes)}}
  optional-lib@3.2.1:
    resolution: {integrity: ${integrity(optionalBytes)}}
${options.optionalOs ? `    os: [${options.optionalOs}]\n` : ""}\
snapshots:
  '@aura3d/engine@file:tarballs/aura3d-engine.tgz': {}
  util@1.2.0(peer-lib@2.0.0):
    dependencies:
      peer-lib: 2.0.0
    optionalDependencies:
      optional-lib: 3.2.1
  peer-lib@2.0.0: {}
  optional-lib@3.2.1:
    optional: true
`;
  const input: PnpmInspectionInput = {
    manifestBytes: Buffer.from(JSON.stringify(manifest)), lockBytes: Buffer.from(lock),
    candidatePackages: [{ name: "@aura3d/engine", version: "1.2.3", tarball: "plan/aura3d-engine.tgz", sha256: digest("sha256", candidateBytes, "hex"), integrity: integrity(candidateBytes) }],
    archives: [
      { resolved: "file:./tarballs/aura3d-engine.tgz", path: "archives/engine.tgz" },
      { resolved: "https://registry.npmjs.org/util/-/util-1.2.0.tgz", path: "archives/util.tgz" },
      { resolved: "https://registry.npmjs.org/peer-lib/-/peer-lib-2.0.0.tgz", path: "archives/peer.tgz" },
      { resolved: "https://registry.npmjs.org/optional-lib/-/optional-lib-3.2.1.tgz", path: "archives/optional.tgz" }
    ],
    readArchive: path => source.get(path) ?? new Uint8Array()
  };
  const withLock = (change: (text: string) => string): PnpmInspectionInput => ({ ...input, lockBytes: Buffer.from(change(lock)) });
  return { input, lock, source, withLock, candidateManifest, utilManifest, peerManifest, optionalManifest };
}

const roots: string[] = [];
afterEach(() => {
  admissionMock.enabled = false; admissionMock.archives = []; admissionMock.onConsume = undefined;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("pnpm v9 independent archive inspection", () => {
  it("binds local candidates, registry aliases, peer variants and optional branches", () => {
    const state = fixture();
    const result = inspectIndependentPnpmConsumer(state.input);
    expect(result.packageKeys).toEqual([
      "@aura3d/engine@file:tarballs/aura3d-engine.tgz", "optional-lib@3.2.1", "peer-lib@2.0.0", "util@1.2.0(peer-lib@2.0.0)"
    ]);
    expect(result.archives).toHaveLength(4);
    expect(result.archives.find(item => item.resolved.startsWith("file:"))?.integrity).toBe(state.input.candidatePackages[0].integrity);
    const captured = Buffer.from(result.archives[0].bytes);
    state.source.get(result.archives[0].path)?.fill(0);
    expect(Buffer.from(result.archives[0].bytes)).toEqual(captured);
  });

  it("rejects duplicate keys, aliases, anchors, tags, patches and additional documents", () => {
    const state = fixture();
    const cases = [
      (text: string) => `${text}\nlockfileVersion: '9.0'\n`,
      (text: string) => text.replace("autoInstallPeers: true", "autoInstallPeers: &setting true"),
      (text: string) => text.replace("autoInstallPeers: true", "autoInstallPeers: *setting"),
      (text: string) => text.replace("autoInstallPeers: true", "autoInstallPeers: !tag true"),
      (text: string) => `${text}\npatchedDependencies: {}\n`,
      (text: string) => `${text}\n---\nlockfileVersion: '9.0'\n`,
      (text: string) => text.replace("version: util@1.2.0(peer-lib@2.0.0)", "version: link:../outside")
    ];
    for (const change of cases) expect(() => inspectIndependentPnpmConsumer(state.withLock(change))).toThrow(/PNPM_INDEPENDENCE/);
  });

  it("rejects changed roots, alias targets, missing peer or optional edges and extra snapshots", () => {
    const state = fixture();
    const cases = [
      (text: string) => text.replace("specifier: npm:util@^1.0.0", "specifier: npm:util@^2.0.0"),
      (text: string) => text.replace("version: util@1.2.0(peer-lib@2.0.0)", "version: different@1.2.0(peer-lib@2.0.0)"),
      (text: string) => text.replace("      peer-lib: 2.0.0\n", ""),
      (text: string) => text.replace("      optional-lib: 3.2.1\n", ""),
      (text: string) => text.replace("  peer-lib@2.0.0: {}", "  different@2.0.0: {}")
    ];
    for (const change of cases) expect(() => inspectIndependentPnpmConsumer(state.withLock(change))).toThrow();
  });

  it("rejects candidate mismatches, modified tarballs, unlisted or unused archives and bundling", () => {
    const state = fixture();
    expect(() => inspectIndependentPnpmConsumer({ ...state.input, candidatePackages: [{ ...state.input.candidatePackages[0], sha256: "0".repeat(64) }] })).toThrow(/candidate archive mismatch/);
    expect(() => inspectIndependentPnpmConsumer({ ...state.input, archives: state.input.archives.slice(1) })).toThrow(/missing package archive/);
    expect(() => inspectIndependentPnpmConsumer({ ...state.input, archives: [...state.input.archives, { resolved: "https://registry.npmjs.org/extra/-/extra-1.0.0.tgz", path: "archives/extra.tgz" }] })).toThrow(/unused entries/);
    state.source.set("archives/util.tgz", archive({ name: "util", version: "1.2.0" }));
    expect(() => inspectIndependentPnpmConsumer(state.input)).toThrow(/integrity mismatch/);
    expect(() => inspectIndependentPnpmConsumer(fixture({ bundled: true }).input)).toThrow(/bundled dependencies/);
  });

  it("never treats inspection, fake capabilities, or an archive directory as install proof", () => {
    const { input } = fixture();
    expect(() => assertIndependentPnpmConsumer({ ...input, admission: { capability: {} as never } })).toThrow();
    expect(() => seedVerifiedPnpmStore({ storeDir: "/not-created" })).toThrow(/PNPM_STORE_UNAVAILABLE/);
    expect(() => assertInstalledPnpmArchiveSet({ projectDir: "/not-read" })).toThrow(/PNPM_INSTALLED_SET_UNAVAILABLE/);
  });
});

function consumerFixture(optionalOs?: string) {
  const fixtureData = fixture({ bin: true, optionalOs });
  const parent = realpathSync(mkdtempSync(join(tmpdir(), "aura-pnpm-consumer-tree-"))); roots.push(parent);
  const projectDir = join(parent, "project"), storeDir = join(parent, "store");
  const modules = join(projectDir, "node_modules"), virtual = join(modules, ".pnpm");
  const candidate = join(virtual, "file+tarballs+aura3d-engine.tgz/node_modules/@aura3d/engine");
  const util = join(virtual, "util@1.2.0_peer-lib@2.0.0/node_modules/util");
  const peer = join(virtual, "peer-lib@2.0.0/node_modules/peer-lib");
  const optional = join(virtual, "optional-lib@3.2.1/node_modules/optional-lib");
  const omitted = optionalOs !== undefined && optionalOs !== process.platform;
  const put = (path: string, data: string | Uint8Array, mode = 0o644) => {
    mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, data); chmodSync(path, mode);
  };
  const link = (path: string, target: string) => {
    mkdirSync(dirname(path), { recursive: true }); symlinkSync(relative(dirname(path), target), path);
  };
  put(join(projectDir, "package.json"), fixtureData.input.manifestBytes);
  put(join(projectDir, "pnpm-lock.yaml"), fixtureData.input.lockBytes);
  put(join(projectDir, "tarballs/aura3d-engine.tgz"), fixtureData.source.get("archives/engine.tgz")!);
  put(join(virtual, "lock.yaml"), fixtureData.input.lockBytes);
  put(join(candidate, "package.json"), JSON.stringify(fixtureData.candidateManifest));
  put(join(util, "package.json"), JSON.stringify(fixtureData.utilManifest));
  put(join(util, "bin/util.js"), "#!/usr/bin/env node\nexport const fixture = 1;\n", 0o755);
  put(join(peer, "package.json"), JSON.stringify(fixtureData.peerManifest));
  if (!omitted) put(join(optional, "package.json"), JSON.stringify(fixtureData.optionalManifest));
  link(join(modules, "@aura3d/engine"), candidate);
  link(join(modules, "util-alias"), util);
  link(join(dirname(util), "peer-lib"), peer);
  if (!omitted) link(join(dirname(util), "optional-lib"), optional);
  link(join(virtual, "node_modules/peer-lib"), peer);
  const meta = {
    hoistedDependencies: { "peer-lib@2.0.0": { "peer-lib": "private" } }, hoistPattern: ["*"],
    included: { dependencies: true, devDependencies: true, optionalDependencies: true }, injectedDeps: {},
    layoutVersion: 5, nodeLinker: "isolated", packageManager: "pnpm@11.1.3", pendingBuilds: [],
    publicHoistPattern: [], prunedAt: "Fri, 30 Oct 2026 02:06:02 GMT",
    registries: { default: "https://registry.npmjs.org/", "@jsr": "https://npm.jsr.io/" },
    skipped: omitted ? ["optional-lib@3.2.1"] : [], storeDir: join(storeDir, "v11"),
    virtualStoreDir: ".pnpm", virtualStoreDirMaxLength: 120
  };
  put(join(modules, ".modules.yaml"), `${JSON.stringify(meta, null, 2)}\n`);
  const nodePath = [join(util, "node_modules"), dirname(util), join(virtual, "node_modules")].join(":");
  const wrapper = String.raw`#!/bin/sh
basedir=$(dirname "$(echo "$0" | sed -e 's,\\,/,g')")

case ` + "`uname`" + String.raw` in
    *CYGWIN*|*MINGW*|*MSYS*)
        if command -v cygpath > /dev/null 2>&1; then
            basedir=` + '`cygpath -w "$basedir"`' + String.raw`
        fi
    ;;
esac

if [ -z "$NODE_PATH" ]; then
  export NODE_PATH="` + nodePath + String.raw`"
else
  export NODE_PATH="` + nodePath + String.raw`:$NODE_PATH"
fi
if [ -x "$basedir/node" ]; then
  exec "$basedir/node"  "$basedir/../util-alias/bin/util.js" "$@"
else
  exec node  "$basedir/../util-alias/bin/util.js" "$@"
fi
# cmd-shim-target=` + join(modules, "util-alias/bin/util.js") + "\n";
  put(join(modules, ".bin/utilcmd"), wrapper, 0o755);
  admissionMock.enabled = true; admissionMock.capability = {};
  admissionMock.archives = fixtureData.input.archives.map(item => ({ resolved: item.resolved,
    bytes: fixtureData.source.get(item.path)! }));
  const input = { projectDir, storeDir, admission: { capability: admissionMock.capability as never,
    manifestBytes: fixtureData.input.manifestBytes, lockBytes: fixtureData.input.lockBytes } };
  return { ...fixtureData, projectDir, storeDir, modules, virtual, candidate, util, peer, optional, meta, wrapper, put, link, input,
    verify: () => assertInstalledPnpmArchiveSet(input) };
}

describe("pnpm installed consumer verification", () => {
  it("checks exact local and registry packages, peer variants, aliases, private hoists and generated bins", () => {
    const f = consumerFixture(), result = f.verify();
    expect(result).toMatchObject({ installationAuthorized: false, omittedSnapshotKeys: [],
      snapshotKeys: ["@aura3d/engine@file:tarballs/aura3d-engine.tgz", "optional-lib@3.2.1", "peer-lib@2.0.0", "util@1.2.0(peer-lib@2.0.0)"] });
  });

  it("allows only a host-incompatible optional branch and still binds its archive", () => {
    const other = process.platform === "linux" ? "darwin" : "linux";
    const f = consumerFixture(other);
    expect(f.verify().omittedSnapshotKeys).toEqual(["optional-lib@3.2.1"]);
    admissionMock.archives.find(item => item.resolved.includes("optional-lib"))!.bytes[0] ^= 1;
    expect(f.verify).toThrow();
  });

  it("rejects compatible omissions, altered peer links and arbitrary package files", () => {
    const f = consumerFixture();
    rmSync(join(dirname(f.util), "optional-lib"));
    expect(f.verify).toThrow(/missing consumer dependency/);
    f.link(join(dirname(f.util), "optional-lib"), f.optional);
    rmSync(join(dirname(f.util), "peer-lib"));
    f.link(join(dirname(f.util), "peer-lib"), f.candidate);
    expect(f.verify).toThrow(/exact snapshot location/);
    rmSync(join(dirname(f.util), "peer-lib"));
    f.link(join(dirname(f.util), "peer-lib"), f.peer);
    f.put(join(f.util, "injected.js"), "unreviewed");
    expect(f.verify).toThrow(/unrecorded consumer package file/);
  });

  it("rejects changed shims, forged hoists, metadata ambiguity and undeclared modules", () => {
    const f = consumerFixture();
    f.put(join(f.modules, ".bin/utilcmd"), f.wrapper.replace('exec node', 'exec evil'), 0o755);
    expect(f.verify).toThrow(/bin shim differs/);
    f.put(join(f.modules, ".bin/utilcmd"), f.wrapper, 0o755);
    f.put(join(f.modules, ".modules.yaml"), JSON.stringify({ ...f.meta,
      hoistedDependencies: { "peer-lib@2.0.0": { alien: "private" } } }));
    expect(f.verify).toThrow(/hoist is not uniquely bound/);
    f.put(join(f.modules, ".modules.yaml"), `{"layoutVersion":5,"layoutVersion":5}`);
    expect(f.verify).toThrow(/ambiguous consumer modules metadata/);
    f.put(join(f.modules, ".modules.yaml"), JSON.stringify(f.meta));
    f.link(join(f.modules, "alien"), f.peer);
    expect(f.verify).toThrow(/unrecorded consumer dependency/);
  });

  it.each([
    "http://127.0.0.1:49152/",
    `http://127.0.0.1:49152/${"a".repeat(48)}/`,
    "http://localhost:9/",
    "http://127.0.0.1:9/arbitrary/"
  ])("rejects unsealed dynamic loopback registry metadata: %s", registry => {
    const f = consumerFixture();
    f.put(join(f.modules, ".modules.yaml"), JSON.stringify({ ...f.meta,
      registries: { ...f.meta.registries, default: registry } }));
    expect(f.verify).toThrow(/unsupported consumer registry metadata/);
  });

  it("does not accept caller-supplied registry claims as dispatcher authority", () => {
    const f = consumerFixture();
    f.put(join(f.modules, ".modules.yaml"), JSON.stringify({ ...f.meta,
      registries: { ...f.meta.registries, default: `http://127.0.0.1:49152/${"a".repeat(48)}/` } }));
    expect(() => assertInstalledPnpmArchiveSet({ ...f.input,
      dispatcher: { registryPath: `/${"a".repeat(48)}/`, origin: "http://127.0.0.1:49152" } } as never))
      .toThrow(/invalid consumer verification options/);
  });

  it("rechecks the live admission after inspecting the tree", () => {
    const f = consumerFixture(); let count = 0;
    admissionMock.onConsume = () => {
      if (++count === 2) admissionMock.archives[0].bytes[0] ^= 1;
    };
    expect(f.verify).toThrow();
  });
});
