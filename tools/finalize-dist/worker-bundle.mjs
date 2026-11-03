import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import ts from "typescript";

const MODIFIED_NOTICE = "// Modified by Aura3D: added module bindings and a default export for ESM loading.";
const NOTICE_PREFIX = "// Modified by Aura3D: added the upstream license notice for packaged distribution.";
const ASSETS = {
  vfx1024: "aura-vfx-1k.png", vfx2048: "aura-vfx-2k.png", humanoid: "humanoid-fixture.glb", retargetWorker: "retarget.worker.bundle.js",
  basisScript: "basis_transcoder.js", basisModule: "basis_transcoder.mjs", basisWasm: "basis_transcoder.wasm",
  basisWorker: "ktx2.worker.js", dracoModule: "draco_decoder.mjs", dracoWasm: "draco_decoder.wasm", meshoptModule: "meshopt_decoder.mjs",
  zstdWorker: "zstd.worker.bundle.js"
};
const ZSTD_SEPARATOR = "\n--AURA3D-ZSTD-WASM--\n";
const ZSTD_SHA256 = "8b093c4c144273776d511f3baaa0fec32c111500c2798cb4569a71479020e72a";
const ZSTD_BYTES = 54394;

/** Keep the complete upstream permission notices with separately emitted JS. */
export function licenseBanner(name, ...licenses) {
  return `/*! ${name}\n${licenses.map((license) => license.replaceAll("*/", "* /").trim()).join("\n\n")}\n*/\n`;
}

export function moduleCodec(source, name, banner) {
  return `${banner}${MODIFIED_NOTICE}\nconst module = undefined, exports = undefined, define = undefined;\nconst importScripts = globalThis.importScripts ?? (() => { throw new TypeError("importScripts unavailable"); });\n${source}\nexport default ${name};\n`;
}

/** Single ESM file: internal dynamic imports remain lazy but cannot form chunks. */
export function workerBundleOptions(root, entry, outfile) {
  return {
    absWorkingDir: root,
    entryPoints: [entry],
    outfile,
    bundle: true,
    splitting: false,
    platform: "browser",
    format: "esm",
    target: "es2022",
    treeShaking: true,
    legalComments: "inline",
    sourcemap: false,
    metafile: true,
    write: false,
    logLevel: "silent"
  };
}

/** A copied worker asset cannot resolve bare or relative static module imports. */
export function assertSelfContainedWorker(source, label, marker) {
  const parsed = ts.createSourceFile(`${label}.ts`, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (parsed.parseDiagnostics.length) throw new Error(`${label}: invalid emitted JavaScript`);
  const imports = [];
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) imports.push(node.moduleSpecifier.getText(parsed));
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments.length && ts.isStringLiteralLike(node.arguments[0])) imports.push(node.arguments[0].getText(parsed));
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  if (imports.length) throw new Error(`${label}: bundle retains static module imports: ${imports.join(", ")}`);
  if (!source.includes("postMessage") || !source.includes(marker)) throw new Error(`${label}: worker protocol code is missing`);
}

/** Check the executable notice and pinned binary, even after a consumer minifies the worker. */
export function assertZstdWorkerPayload(source, license, provenance) {
  assertSelfContainedWorker(source, "Zstandard worker", "expectedBytes");
  const parsed = ts.createSourceFile("zstd.worker.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const packages = [];
  let postsNotice = false;
  let dynamicImport = false;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) dynamicImport = true;
    if (ts.isStringLiteralLike(node) && node.text.length > ZSTD_SEPARATOR.length && node.text.includes(ZSTD_SEPARATOR)) packages.push(node.text);
    const callee = ts.isCallExpression(node) && ts.isNonNullExpression(node.expression) ? node.expression.expression : ts.isCallExpression(node) ? node.expression : undefined;
    if (ts.isCallExpression(node) && callee && ts.isPropertyAccessExpression(callee) && callee.name.text === "postMessage" &&
        node.arguments.some((arg) => ts.isObjectLiteralExpression(arg) && arg.properties.some((property) =>
          (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) && property.name?.getText(parsed).replaceAll(/^["']|["']$/g, "") === "notice"))) postsNotice = true;
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  if (dynamicImport) throw new Error("Zstandard worker retains a dynamic module import");
  if (packages.length !== 1 || !postsNotice) throw new Error("Zstandard worker does not retain its executable license notice");
  const [notice, base64, ...extra] = packages[0].split(ZSTD_SEPARATOR);
  if (extra.length || notice !== license.trimEnd()) throw new Error("Zstandard worker license notice differs from the distributed license");
  if (!base64 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) throw new Error("Zstandard worker binary encoding is invalid");
  const binary = Buffer.from(base64, "base64");
  const digest = createHash("sha256").update(binary).digest("hex");
  if (binary.length !== ZSTD_BYTES || digest !== ZSTD_SHA256 || provenance?.schema !== "aura3d.vendor-provenance/1" || provenance.wasmBytes !== ZSTD_BYTES || provenance.wasmSha256 !== ZSTD_SHA256) {
    throw new Error("Zstandard worker binary does not match its pinned provenance");
  }
}

/** The standalone asset package must expose a worker entry recognizable by Vite. */
export function assertZstdWorkerFactory(source) {
  const parsed = ts.createSourceFile("ZstdDecoder.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (parsed.parseDiagnostics.length) throw new Error("Invalid Zstandard worker factory syntax");
  let found = false;
  function visit(node) {
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Worker" && node.arguments?.length === 2) {
      const [url, options] = node.arguments;
      if (ts.isNewExpression(url) && ts.isIdentifier(url.expression) && url.expression.text === "URL" && url.arguments?.length === 2 &&
          ts.isStringLiteral(url.arguments[0]) && url.arguments[0].text === "../workers/zstd.worker.js" &&
          ts.isPropertyAccessExpression(url.arguments[1]) && url.arguments[1].name.text === "url" && ts.isMetaProperty(url.arguments[1].expression) &&
          url.arguments[1].expression.keywordToken === ts.SyntaxKind.ImportKeyword && ts.isObjectLiteralExpression(options) && options.properties.length === 1) {
        const type = options.properties[0];
        if (ts.isPropertyAssignment(type) && type.name.getText(parsed) === "type" && ts.isStringLiteral(type.initializer) && type.initializer.text === "module") found = true;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  if (!found) throw new Error("Zstandard decoder lacks a static module-worker fallback");
}

/** Both published tarballs must include their worker and its notices. */
export function assertZstdPackageMetadata(rootManifest, assetsManifest) {
  const includes = (array, name) => Array.isArray(array) && array.includes(name);
  if (!includes(rootManifest.files, "dist/assets") || !includes(rootManifest.files, "dist/engine") ||
      !includes(rootManifest.sideEffects, "./dist/assets/workers/zstd.worker.js") ||
      !includes(rootManifest.sideEffects, "./dist/engine/agent-api/app/worker-assets/zstd.worker.bundle.js") ||
      !includes(assetsManifest.files, "dist") || !includes(assetsManifest.files, "vendor") ||
      !includes(assetsManifest.sideEffects, "./dist/workers/zstd.worker.js")) {
    throw new Error("Zstandard worker package metadata omits a worker or license directory");
  }
}

function isAssetUrl(node, name) {
  return ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "URL" && node.arguments?.length === 2 &&
    ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === `./worker-assets/${name}?no-inline` &&
    ts.isPropertyAccessExpression(node.arguments[1]) && node.arguments[1].name.text === "url" &&
    ts.isMetaProperty(node.arguments[1].expression) && node.arguments[1].expression.keywordToken === ts.SyntaxKind.ImportKeyword;
}

/** Ensure application bundlers can see every separate packaged asset. */
export function assertPackagedWorkerFactory(source) {
  const parsed = ts.createSourceFile("workerFactoryPackaged.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (parsed.parseDiagnostics.length) throw new Error("Invalid packaged worker factory syntax");
  const urlFactory = parsed.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "workerRendererUrl");
  const workerFactory = parsed.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "createWorkerRendererWorker");
  if (!urlFactory?.body || !workerFactory?.body ||
      !urlFactory.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ||
      !workerFactory.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) throw new Error("Packaged worker factory exports are missing");
  const declaration = urlFactory.body.statements.find(ts.isVariableStatement)?.declarationList.declarations.find((node) => ts.isIdentifier(node.name) && node.name.text === "assets");
  if (!declaration?.initializer || !ts.isObjectLiteralExpression(declaration.initializer) || declaration.initializer.properties.length !== Object.keys(ASSETS).length) throw new Error("Packaged worker asset manifest is incomplete");
  for (const [name, path] of Object.entries(ASSETS)) {
    const property = declaration.initializer.properties.find((node) => ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === name);
    if (!property || !ts.isPropertyAssignment(property) || !ts.isPropertyAccessExpression(property.initializer) || property.initializer.name.text !== "href" || !isAssetUrl(property.initializer.expression, path)) throw new Error(`Packaged worker asset URL is invalid: ${name}`);
  }
  const returned = urlFactory.body.statements.find(ts.isReturnStatement)?.expression;
  if (!returned || !ts.isCallExpression(returned) || !ts.isIdentifier(returned.expression) || returned.expression.text !== "workerUrlWithAssets" || returned.arguments.length !== 2 || !isAssetUrl(returned.arguments[0], "render.worker.bundle.js") || !ts.isIdentifier(returned.arguments[1]) || returned.arguments[1].text !== "assets") throw new Error("Packaged worker URL does not carry its asset manifest");
  const worker = workerFactory.body.statements.find(ts.isReturnStatement)?.expression;
  if (!worker || !ts.isNewExpression(worker) || !ts.isIdentifier(worker.expression) || worker.expression.text !== "Worker" || worker.arguments?.length !== 2 || !ts.isCallExpression(worker.arguments[0]) || !ts.isIdentifier(worker.arguments[0].expression) || worker.arguments[0].expression.text !== "workerRendererUrl" || worker.arguments[0].arguments.length !== 0 || !ts.isObjectLiteralExpression(worker.arguments[1]) || worker.arguments[1].properties.length !== 1) throw new Error("Packaged worker constructor is invalid");
  const type = worker.arguments[1].properties[0];
  if (!ts.isPropertyAssignment(type) || !ts.isIdentifier(type.name) || type.name.text !== "type" || !ts.isStringLiteral(type.initializer) || type.initializer.text !== "module") throw new Error("Packaged worker must use module type");
}

function inside(parent, path) {
  const rel = relative(parent, path);
  return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`));
}

function checkedSource(root, path) {
  const file = resolve(root, path);
  if (!inside(root, file) || !existsSync(file)) throw new Error(`worker bundle missing input: ${path}`);
  return file;
}

function readResult(result, root, label, marker) {
  if (!result.metafile || result.outputFiles?.length !== 1) throw new Error(`${label}: expected exactly one worker output and a metafile`);
  for (const file of Object.keys(result.metafile.inputs)) {
    const path = resolve(root, file);
    if (!inside(join(root, "dist"), path) && !inside(join(root, "node_modules"), path)) {
      throw new Error(`${label}: input resolves outside emitted dist or installed dependencies: ${file}`);
    }
  }
  for (const output of Object.values(result.metafile.outputs)) {
    if (output.imports?.some((entry) => entry.external)) throw new Error(`${label}: bundle retains external package imports`);
  }
  const source = result.outputFiles[0].text;
  assertSelfContainedWorker(source, label, marker);
  return source;
}

/** Emit a raw, same-origin ESM worker asset and static URLs for its dependencies. */
export async function emitPackagedWorker(rootInput, buildOverride) {
  const root = resolve(rootInput);
  const app = join(root, "dist/engine/agent-api/app");
  const output = join(app, "worker-assets");
  const render = checkedSource(root, "dist/engine/agent-api/app/render.worker.js");
  const retarget = checkedSource(root, "dist/animation/pose/retarget.worker.js");
  const packagedFactory = checkedSource(root, "dist/engine/agent-api/app/workerFactoryPackaged.js");
  assertPackagedWorkerFactory(readFileSync(packagedFactory, "utf8"));
  const zstdWorker = readFileSync(checkedSource(root, "dist/assets/workers/zstd.worker.js"), "utf8");
  const standaloneZstdWorker = readFileSync(checkedSource(root, "packages/assets/dist/workers/zstd.worker.js"), "utf8");
  const decoderLicense = readFileSync(checkedSource(root, "packages/assets/vendor/zstd/LICENSE.txt"), "utf8");
  const decoderProvenance = readFileSync(checkedSource(root, "packages/assets/vendor/zstd/provenance.json"), "utf8");
  const provenance = JSON.parse(decoderProvenance);
  assertZstdWorkerPayload(zstdWorker, decoderLicense, provenance);
  assertZstdWorkerPayload(standaloneZstdWorker, decoderLicense, provenance);
  if (zstdWorker !== standaloneZstdWorker) throw new Error("Zstandard worker differs between published package layouts");
  for (const path of ["dist/assets/loaders/ZstdDecoder.js", "packages/assets/dist/loaders/ZstdDecoder.js"]) {
    assertZstdWorkerFactory(readFileSync(checkedSource(root, path), "utf8"));
  }
  assertZstdPackageMetadata(JSON.parse(readFileSync(checkedSource(root, "package.json"), "utf8")), JSON.parse(readFileSync(checkedSource(root, "packages/assets/package.json"), "utf8")));
  const ktxWorker = checkedSource(root, "dist/assets/workers/ktx2.worker.js");
  const basisSource = readFileSync(checkedSource(root, "packages/assets/vendor/basis/basis_transcoder.js"), "utf8");
  const dracoSource = readFileSync(checkedSource(root, "packages/assets/vendor/draco/draco_decoder.js"), "utf8");
  const meshoptSource = readFileSync(checkedSource(root, "packages/assets/vendor/meshopt/meshopt_decoder.mjs"), "utf8");
  const basisLicense = readFileSync(checkedSource(root, "packages/assets/vendor/basis/LICENSE.txt"), "utf8");
  const zstdLicense = readFileSync(checkedSource(root, "packages/assets/vendor/basis/LICENSE-zstd.txt"), "utf8");
  const dracoLicense = readFileSync(checkedSource(root, "packages/assets/vendor/draco/LICENSE.txt"), "utf8");
  const meshoptLicense = readFileSync(checkedSource(root, "packages/assets/vendor/meshopt/LICENSE.txt"), "utf8");
  const build = buildOverride ?? (await import("esbuild")).build;
  const renderResult = await build(workerBundleOptions(root, render, join(output, "render.worker.bundle.js")));
  const retargetResult = await build(workerBundleOptions(root, retarget, join(output, "retarget.worker.bundle.js")));
  const renderCode = readResult(renderResult, root, "render worker", "init");
  const retargetCode = readResult(retargetResult, root, "retarget worker", "bake");
  mkdirSync(output, { recursive: true });
  const basisBanner = licenseBanner("Basis Universal and Zstandard", basisLicense, zstdLicense);
  const dracoBanner = licenseBanner("Draco", dracoLicense);
  const meshoptBanner = licenseBanner("Meshoptimizer", meshoptLicense);
  writeFileSync(join(output, "render.worker.bundle.js"), `${basisBanner}${dracoBanner}${meshoptBanner}${renderCode}`);
  writeFileSync(join(output, "retarget.worker.bundle.js"), retargetCode);
  // This copy gets a different filename and the original TypeScript source map
  // is not an asset dependency of the published worker.
  writeFileSync(join(output, "zstd.worker.bundle.js"), zstdWorker.replace(/(?:\r?\n)?\/\/# sourceMappingURL=[^\r\n]*(?:\r?\n)?$/, "\n"));
  writeFileSync(join(output, "LICENSE-zstd-decoder.txt"), decoderLicense);
  writeFileSync(join(output, "provenance-zstd.json"), decoderProvenance);
  writeFileSync(join(output, "basis_transcoder.js"), `${basisBanner}${NOTICE_PREFIX}\n${basisSource}`);
  writeFileSync(join(output, "basis_transcoder.mjs"), moduleCodec(basisSource, "BASIS", basisBanner));
  writeFileSync(join(output, "draco_decoder.mjs"), moduleCodec(dracoSource, "DracoDecoderModule", dracoBanner));
  writeFileSync(join(output, "meshopt_decoder.mjs"), `${meshoptBanner}${NOTICE_PREFIX}\n${meshoptSource}`);
  for (const [source, target] of [
    ["packages/assets/vendor/basis/basis_transcoder.wasm", "basis_transcoder.wasm"],
    ["packages/assets/vendor/draco/draco_decoder.wasm", "draco_decoder.wasm"],
    ["packages/engine/assets/vfx/aura-vfx-1k.png", "aura-vfx-1k.png"],
    ["packages/engine/assets/vfx/aura-vfx-2k.png", "aura-vfx-2k.png"],
    ["packages/engine/src/agent-api/assets/humanoid-fixture.glb", "humanoid-fixture.glb"]
  ]) copyFileSync(checkedSource(root, source), join(output, target));
  copyFileSync(ktxWorker, join(output, "ktx2.worker.js"));
  for (const [name, text] of [["LICENSE-basis.txt", basisLicense], ["LICENSE-zstd.txt", zstdLicense], ["LICENSE-draco.txt", dracoLicense], ["LICENSE-meshopt.txt", meshoptLicense]]) {
    writeFileSync(join(output, name), text);
  }
  copyFileSync(packagedFactory, join(app, "workerFactory.js"));
}
