// node --test artifacts/gu47-meshy/_tools/wp36-decisions.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { MAX_CHAIN_RESTARTS, PRISM_REFUSAL, classifyCreateFailure, followUpRecovery, idleDecision, maxUsable, poolExhausted } from "./wp36-decisions.mjs";

const PARENT_402 = 'meshy api 402 on /animations: {"detail":"parent_key_exhausted: the Meshy account that owns the parent task is out of credits."}';
const QUOTA_503 = 'meshy api 503 on /animations: {"detail":"quota_exhausted"}';
const pool = (...balances) => ({ keys: balances.map((b, i) => ({ id: `k${i}`, state: b < 0 ? "exhausted" : "ok", remaining: Math.abs(b), inflight: 0 })) });
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function rootForTest() {
  for (let dir = dirname(fileURLToPath(import.meta.url)); dir !== dirname(dir); dir = dirname(dir)) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
  }
  throw new Error("repository root not found");
}

function sourceModuleForTest() {
  return import(pathToFileURL(join(rootForTest(), "docs/prds/game-upgrades-47/lanes/wp36-source.mjs")).href);
}

function readGlbForTest(path) {
  const bytes = readFileSync(path);
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8"));
  const binStart = 20 + jsonLength + 8;
  return { json, bin: bytes.subarray(binStart) };
}

function changeGlbJsonForTest(path, change) {
  const { json, bin } = readGlbForTest(path);
  change(json);
  const encoded = Buffer.from(JSON.stringify(json));
  const padding = Buffer.alloc((4 - encoded.length % 4) % 4, 0x20);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + encoded.length + padding.length + 8 + bin.length, 8);
  header.writeUInt32LE(encoded.length + padding.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(bin.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, encoded, padding, binHeader, bin]);
}

function accessorSnapshot(accessor) {
  if (!accessor) return null;
  const array = accessor.getArray();
  return {
    count: accessor.getCount(),
    type: accessor.getType(),
    componentType: accessor.getComponentType(),
    normalized: accessor.getNormalized(),
    bytes: sha256(Buffer.from(array.buffer, array.byteOffset, array.byteLength))
  };
}

function geometrySnapshot(doc) {
  return doc.getRoot().listMeshes().map((mesh) => ({
    name: mesh.getName(),
    primitives: mesh.listPrimitives().map((primitive) => ({
      indices: accessorSnapshot(primitive.getIndices()),
      attributes: Object.fromEntries(primitive.listSemantics().sort().map((semantic) => [semantic, accessorSnapshot(primitive.getAttribute(semantic))])),
      targets: primitive.listTargets().map((target) => Object.fromEntries(target.listSemantics().sort().map((semantic) => [semantic, accessorSnapshot(target.getAttribute(semantic))])))
    }))
  }));
}

function geometryHashFromDocument(doc) {
  const whole = createHash("sha256");
  let count = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute("POSITION");
      if (!position) continue;
      const bytes = (accessor) => {
        if (!accessor) return Buffer.alloc(0);
        const array = accessor.getArray();
        return Buffer.from(array.buffer, array.byteOffset, array.byteLength);
      };
      whole.update(createHash("sha256").update(bytes(position)).update(bytes(primitive.getIndices())).digest("hex"));
      count += 1;
    }
  }
  return { primitiveCount: count, geometryHash: `sha256-${whole.digest("hex")}` };
}

function opRetextureForTest(context) {
  const script = readFileSync(new URL("./wp36-pipeline.mjs", import.meta.url), "utf8");
  const start = script.indexOf("async function opRetexture(st, row) {");
  const end = script.indexOf("\nfunction depState(row) {", start);
  assert.ok(start >= 0 && end > start);
  const operation = script.slice(start, end).trim();
  const importExpression = 'await import(pathToFileURL(join(ROOT, "docs/prds/game-upgrades-47/lanes/wp36-source.mjs")).href)';
  assert.equal(operation.split(importExpression).length, 2);
  return runInNewContext(`(${operation.replace(importExpression, "await loadRetextureModule()")})`, {
    ...context,
    loadRetextureModule: async () => ({ prepareRetextureSource: context.prepareRetextureSource })
  });
}

test("parent_key_exhausted is a per-account failure whether or not the call was marked pinned", () => {
  assert.equal(classifyCreateFailure(1, PARENT_402, true), "pinned-exhausted");
  assert.equal(classifyCreateFailure(1, PARENT_402, false), "pinned-exhausted");
});

test("bare quota_exhausted (older Prism) is per-account on a pinned call, pool-wide on an unpinned one", () => {
  assert.equal(classifyCreateFailure(1, QUOTA_503, true), "pinned-exhausted");
  assert.equal(classifyCreateFailure(1, QUOTA_503, false), "credits");
  assert.equal(classifyCreateFailure(9, "", false), "credits");
});

test("other create failures", () => {
  assert.equal(classifyCreateFailure(1, 'meshy api 503 on /rigging: {"detail":"busy"}', false), "rate");
  assert.equal(classifyCreateFailure(3, "", false), "auth");
  assert.equal(classifyCreateFailure(4, "", false), "invalid");
  assert.equal(classifyCreateFailure(1, "socket hang up", false), "transient");
});

test("Prism refusals before a task exists are recognised (settled as no-charge)", () => {
  assert.equal(PRISM_REFUSAL.exec(PARENT_402)?.[1], "parent_key_exhausted");
  assert.equal(PRISM_REFUSAL.exec(QUOTA_503)?.[1], "quota_exhausted");
  assert.equal(PRISM_REFUSAL.exec("meshy api 500: upstream"), null);
});

test("drained parent: refine starts a new preview, animate re-rigs, both bounded", () => {
  assert.equal(followUpRecovery("refine", 0), "new-preview");
  assert.equal(followUpRecovery("animate", undefined), "rerig");
  assert.equal(followUpRecovery("animate", MAX_CHAIN_RESTARTS - 1), "rerig");
  assert.equal(followUpRecovery("animate", MAX_CHAIN_RESTARTS), "defer");
  assert.equal(followUpRecovery("refine", MAX_CHAIN_RESTARTS), "defer");
});

test("pool exhaustion means no usable key can pay the cheapest op", () => {
  assert.equal(maxUsable(pool(-1000, 1490, 100)), 1490);
  assert.equal(poolExhausted(pool(-2000, -3, 1490)), false);
  assert.equal(poolExhausted(pool(-2000, 4, 3)), true);
  assert.equal(poolExhausted(undefined), false); // unreadable pool is not exhaustion
});

test("only a genuine whole-pool exhaustion parks the queue until reset", () => {
  const funded = pool(-0, -2, 1490);
  const empty = pool(-0, -2, 3);
  assert.equal(idleDecision({ remaining: 600, stopNew: true, pool: empty, waitForCredits: true }), "wait-reset");
  // drained parent accounts only (the 2026-10-30 stall): pool still funded, so re-check instead of waiting days
  assert.equal(idleDecision({ remaining: 600, stopNew: true, pool: funded, waitForCredits: true }), "recheck");
  assert.equal(idleDecision({ remaining: 10, stopNew: false, pool: empty, waitForCredits: true }), "recheck");
  assert.equal(idleDecision({ remaining: 600, stopNew: true, pool: undefined, waitForCredits: true }), "recheck");
  assert.equal(idleDecision({ remaining: 0, stopNew: true, pool: empty, waitForCredits: true }), "end");
  assert.equal(idleDecision({ remaining: 5, stopNew: false, pool: funded, waitForCredits: false }), "end");
});

test("retexture submits and compares the prepared source, while retaining the original source for rights", async () => {
  const original = "/source/pine.glb";
  const prepared = "/derived/pine-decoded.glb";
  const row = { key: "bellPineGouache", source: original, prompt: "pine", sourceInfo: { uv: true }, textureRes: "2k" };
  const st = { tasks: {} };
  let preparation;
  let submitted;
  let hashed;
  let finished;
  const context = {
    sourcePath: (path) => path,
    existsSync: () => true,
    rowDir: () => "/derived",
    join,
    prepareRetextureSource: async (...args) => { preparation = args; return prepared; },
    paidTask: async (state, _row, _name, options) => { submitted = options; state.tasks.retexture = { taskId: "offline-task" }; },
    download: async () => "/download",
    run: async (_command, args) => {
      hashed = args;
      return { stdout: JSON.stringify({ geometryUntouched: true, before: "same", after: "same", primitiveCount: [1, 1] }) };
    },
    GEOMETRY_HASH: "/geometry-hash.mjs",
    process: { execPath: "/node" },
    parseJson: JSON.parse,
    saveState: () => {},
    log: () => {},
    finishModel: async (_state, actualRow, input) => { finished = { source: actualRow.source, input }; }
  };
  const opRetexture = opRetextureForTest(context);
  await opRetexture(st, row);
  assert.equal(submitted.args[submitted.args.indexOf("--model-url") + 1], prepared);
  assert.deepEqual(preparation, [original, "/derived/source"]);
  assert.equal(submitted.args[submitted.args.indexOf("--enable-original-uv") + 1], "true");
  assert.equal(hashed[1], prepared);
  assert.deepEqual(finished, { source: original, input: "/download/model.glb" });
});

test("the planned meshopt sources are decoded losslessly without changing source files, rights, images, or scene data", async (t) => {
  const { prepareRetextureSource } = await sourceModuleForTest();
  const root = rootForTest();
  const plan = JSON.parse(readFileSync(join(root, "docs/prds/game-upgrades-47/lanes/wp36-plan.json"), "utf8"));
  const rows = plan.rows.filter((row) => row.op === "retexture" && row.sourceInfo?.exts?.includes("EXT_meshopt_compression"));
  assert.equal(rows.length, 6);
  assert.ok(rows.some((row) => row.key === "bellPineGouache"));
  const temp = mkdtempSync(join(tmpdir(), "wp36-lossless-"));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
  for (const row of rows) {
    const source = join(root, row.source);
    const rightsName = row.key === "bellBellGouache" ? "belltower" : basename(source, ".glb");
    const rights = join(dirname(dirname(source)), "provenance", `${rightsName}.rights.json`);
    const attribution = join(dirname(dirname(source)), "ATTRIBUTION.md");
    const sourceHash = sha256(readFileSync(source));
    const rightsHash = sha256(readFileSync(rights));
    const attributionHash = sha256(readFileSync(attribution));
    const before = readGlbForTest(source);
    const output = await prepareRetextureSource(source, temp);
    assert.notEqual(output, source);
    assert.equal(dirname(output), temp);
    const after = readGlbForTest(output);
    assert.equal(sha256(readFileSync(source)), sourceHash);
    assert.equal(sha256(readFileSync(rights)), rightsHash);
    assert.equal(sha256(readFileSync(attribution)), attributionHash);
    assert.equal(after.json.extensionsUsed?.includes("EXT_meshopt_compression") ?? false, false);
    assert.equal(after.json.extensionsRequired?.includes("EXT_meshopt_compression") ?? false, false);
    assert.ok(after.json.extensionsRequired?.includes("KHR_mesh_quantization"));
    assert.equal(after.json.bufferViews.some((view) => view.extensions?.EXT_meshopt_compression), false);
    assert.deepEqual(after.json.asset, before.json.asset);
    for (const key of ["accessors", "meshes", "nodes", "scenes", "materials", "textures", "images", "animations", "skins", "extensions", "extras"]) {
      assert.deepEqual(after.json[key], before.json[key], `${row.key}: ${key}`);
    }
    for (const image of before.json.images ?? []) {
      const oldView = before.json.bufferViews[image.bufferView];
      const newView = after.json.bufferViews[image.bufferView];
      const oldBytes = before.bin.subarray(oldView.byteOffset ?? 0, (oldView.byteOffset ?? 0) + oldView.byteLength);
      const newBytes = after.bin.subarray(newView.byteOffset ?? 0, (newView.byteOffset ?? 0) + newView.byteLength);
      assert.equal(sha256(newBytes), sha256(oldBytes), `${row.key}: image ${image.name}`);
    }
    const originalDoc = await io.read(source);
    const preparedDoc = await io.read(output);
    assert.deepEqual(geometrySnapshot(preparedDoc), geometrySnapshot(originalDoc), row.key);
    const hashTool = join(root, "packages/aura3d-cli/skills/aura3d-retexture/references/geometry-hash.mjs");
    const hash = spawnSync(process.execPath, [hashTool, output], { encoding: "utf8" });
    assert.equal(hash.status, 0, hash.stderr);
    const report = JSON.parse(hash.stdout);
    assert.deepEqual({ primitiveCount: report.primitiveCount, geometryHash: report.geometryHash }, geometryHashFromDocument(originalDoc));
    assert.equal(await prepareRetextureSource(source, temp), output);
    t.diagnostic(`${row.key}: ${report.primitiveCount} primitives; ${report.geometryHash}; source sha256-${sourceHash}`);
  }
});

test("uncompressed sources pass through without creating files", async (t) => {
  const { prepareRetextureSource } = await sourceModuleForTest();
  const temp = mkdtempSync(join(tmpdir(), "wp36-uncompressed-"));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const source = join(rootForTest(), "examples/where-the-wind-wanders-port/assets/models/hero.glb");
  const before = sha256(readFileSync(source));
  assert.equal(await prepareRetextureSource(source, temp), source);
  assert.equal(sha256(readFileSync(source)), before);
  assert.deepEqual(readdirSync(temp), []);
});

test("a conflicting derived filename is never overwritten or accepted", async (t) => {
  const { prepareRetextureSource } = await sourceModuleForTest();
  const temp = mkdtempSync(join(tmpdir(), "wp36-collision-"));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const source = join(rootForTest(), "examples/where-the-wind-wanders-port/assets/models/pine.glb");
  const candidate = join(temp, `pine.${sha256(readFileSync(source)).slice(0, 16)}.meshopt-decoded.glb`);
  writeFileSync(candidate, "existing asset", { flag: "wx" });
  const output = await prepareRetextureSource(source, temp);
  assert.notEqual(output, candidate);
  assert.equal(readFileSync(candidate, "utf8"), "existing asset");
  assert.equal(readGlbForTest(output).json.extensionsUsed?.includes("EXT_meshopt_compression") ?? false, false);
});

test("the runtime pipeline copy matches the tested tracked pipeline", (t) => {
  const artifact = join(rootForTest(), "artifacts/gu47-meshy/_tools/wp36-pipeline.mjs");
  if (!existsSync(artifact)) return t.skip("runtime artifact copy is not present");
  assert.equal(readFileSync(artifact, "utf8"), readFileSync(new URL("./wp36-pipeline.mjs", import.meta.url), "utf8"));
});

test("read-only status works in a checkout without meshoptimizer", (t) => {
  const temp = mkdtempSync(join(tmpdir(), "wp36-no-meshoptimizer-"));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const lanes = join(temp, "docs/prds/game-upgrades-47/lanes");
  const cli = join(temp, "packages/aura3d-cli");
  mkdirSync(lanes, { recursive: true });
  mkdirSync(cli, { recursive: true });
  writeFileSync(join(temp, "pnpm-workspace.yaml"), "packages: []\n", { flag: "wx" });
  writeFileSync(join(cli, "package.json"), "{}\n", { flag: "wx" });
  writeFileSync(join(lanes, "wp36-plan.json"), JSON.stringify({
    rows: [{ key: "offlineFixture", slug: "offline", op: "retexture", priority: "P1" }],
    games: {}
  }), { flag: "wx" });
  for (const file of ["wp36-pipeline.mjs", "wp36-decisions.mjs", "wp36-source.mjs"]) {
    writeFileSync(join(lanes, file), readFileSync(new URL(`./${file}`, import.meta.url)), { flag: "wx" });
  }
  const env = { HOME: temp, WP36_ROOT: temp };
  const probe = spawnSync(process.execPath, ["--input-type=module", "--eval", 'await import("meshoptimizer")'], { cwd: lanes, env, encoding: "utf8" });
  assert.notEqual(probe.status, 0);
  assert.match(probe.stderr, /ERR_MODULE_NOT_FOUND/);
  const status = spawnSync(process.execPath, [join(lanes, "wp36-pipeline.mjs"), "status"], { cwd: temp, env, encoding: "utf8" });
  assert.equal(status.status, 0, status.stderr);
  assert.match(status.stdout, /pipeline running: no/);
  assert.match(status.stdout, /"P1":\{"pending":1\}/);
  assert.match(status.stdout, /active: none/);
  const script = readFileSync(join(lanes, "wp36-pipeline.mjs"), "utf8");
  const start = script.indexOf("async function opRetexture(st, row) {");
  const end = script.indexOf("\nfunction depState(row) {", start);
  assert.ok(start >= 0 && end > start);
  const harness = join(temp, "retexture-offline.mjs");
  writeFileSync(harness, `
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const ROOT = ${JSON.stringify(temp)};
const sourcePath = (path) => path;
const existsSync = () => true;
const rowDir = () => ROOT;
let paidCalls = 0;
const paidTask = async () => { paidCalls += 1; };
${script.slice(start, end)}
try {
  await opRetexture({ tasks: {} }, { source: "/offline.glb", prompt: "offline" });
  throw new Error("expected the missing decoder to stop retexture");
} catch (error) {
  if (error.code !== "ERR_MODULE_NOT_FOUND" || !error.message.includes("meshoptimizer") || paidCalls !== 0) throw error;
  console.log("decoder missing; paid calls: " + paidCalls);
}
`, { flag: "wx" });
  const retexture = spawnSync(process.execPath, [harness], { cwd: temp, env, encoding: "utf8" });
  assert.equal(retexture.status, 0, retexture.stderr);
  assert.match(retexture.stdout, /decoder missing; paid calls: 0/);
});

test("a preparation error happens before any paid task is reserved", async () => {
  let paidCalls = 0;
  const op = opRetextureForTest({
    sourcePath: (path) => path,
    existsSync: () => true,
    rowDir: () => "/derived",
    join,
    prepareRetextureSource: async () => { throw new Error("source cannot be safely decoded"); },
    paidTask: async () => { paidCalls += 1; }
  });
  await assert.rejects(op({ tasks: {} }, { key: "bellPineGouache", source: "/source/pine.glb" }), /cannot be safely decoded/);
  assert.equal(paidCalls, 0);
});

test("the real offline decoder feeds the retexture create arguments before any provider call", async (t) => {
  const { prepareRetextureSource } = await sourceModuleForTest();
  const temp = mkdtempSync(join(tmpdir(), "wp36-submit-"));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const stop = new Error("offline stop");
  let submitted;
  const op = opRetextureForTest({
    sourcePath: (path) => path,
    existsSync,
    rowDir: () => temp,
    join,
    prepareRetextureSource,
    paidTask: async (_state, _row, _name, options) => { submitted = options; throw stop; }
  });
  const source = join(rootForTest(), "examples/where-the-wind-wanders-port/assets/models/pine.glb");
  const row = { key: "bellPineGouache", source, prompt: "pine", sourceInfo: { uv: true } };
  await assert.rejects(op({ tasks: {} }, row), (error) => error === stop);
  const prepared = submitted.args[submitted.args.indexOf("--model-url") + 1];
  assert.notEqual(prepared, source);
  assert.equal(dirname(prepared), join(temp, "source"));
  assert.equal(readGlbForTest(prepared).json.extensionsUsed?.includes("EXT_meshopt_compression") ?? false, false);
  assert.equal(row.source, source);
});

test("malformed meshopt inputs fail before creating a derived file", async (t) => {
  const { prepareRetextureSource } = await sourceModuleForTest();
  const temp = mkdtempSync(join(tmpdir(), "wp36-invalid-"));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const source = join(rootForTest(), "examples/where-the-wind-wanders-port/assets/models/pine.glb");
  const cases = [
    ["compressed-range", (json, view, ext) => { ext.byteLength = json.buffers[0].byteLength + 1; }],
    ["unknown-fallback", (json) => { json.buffers[1].extensions.EXT_meshopt_compression.fallback = false; }],
    ["unknown-metadata", (_json, _view, ext) => { ext.opaque = "must not be discarded"; }],
    ["unknown-extension", (json) => { json.extensionsUsed.push("VENDOR_unknown"); json.extensions = { VENDOR_unknown: { bufferIndex: 1 } }; }],
    ["unlisted-extension", (json) => { json.extensions = { VENDOR_unknown: { bufferIndex: 1 } }; }],
    ["missing-buffer", (_json, view) => { view.buffer = 99; }],
    ["fallback-range", (json, view) => { view.byteOffset = json.buffers[1].byteLength + 4; }],
    ["invalid-filter", (_json, _view, ext) => { ext.filter = "INVALID"; }]
  ];
  for (const [name, mutate] of cases) {
    const input = join(temp, `${name}.glb`);
    writeFileSync(input, changeGlbJsonForTest(source, (json) => {
      const view = json.bufferViews.find((item) => item.extensions?.EXT_meshopt_compression);
      mutate(json, view, view.extensions.EXT_meshopt_compression);
    }), { flag: "wx" });
    const out = join(temp, `${name}-out`);
    await assert.rejects(prepareRetextureSource(input, out), undefined, name);
    assert.equal(existsSync(out), false, name);
  }
});

test("embedded copyright and extra source metadata survive decompression", async (t) => {
  const { prepareRetextureSource } = await sourceModuleForTest();
  const temp = mkdtempSync(join(tmpdir(), "wp36-rights-"));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const source = join(rootForTest(), "examples/where-the-wind-wanders-port/assets/models/pine.glb");
  const input = join(temp, "with-rights.glb");
  writeFileSync(input, changeGlbJsonForTest(source, (json) => {
    json.asset.copyright = "Existing author and terms";
    json.asset.extras = { rights: { attribution: "Original source" } };
    json.extras = { provenance: "Existing source evidence" };
  }), { flag: "wx" });
  const before = readGlbForTest(input).json;
  const output = await prepareRetextureSource(input, join(temp, "derived"));
  const after = readGlbForTest(output).json;
  assert.deepEqual(after.asset, before.asset);
  assert.deepEqual(after.extras, before.extras);
  assert.equal(readGlbForTest(input).json.asset.copyright, "Existing author and terms");
});
