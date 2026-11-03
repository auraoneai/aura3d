import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../..");
const roadmap = "docs/prds/aura3d-native-capability-roadmap.md";
const acceptance = "docs/prds/aura3d-native-acceptance.md";
const browserConfig = "tsconfig.browser-tests.json";
const checkConfig = "tsconfig.check.json";

function parseConfig(name: string, historicalBoundary = true): ts.ParsedCommandLine {
  const configPath = resolve(root, name);
  const result = ts.readConfigFile(configPath, ts.sys.readFile);
  if (result.error) throw new Error(ts.flattenDiagnosticMessageText(result.error.messageText, "\n"));
  const raw = result.config as { exclude?: string[] };
  if (!historicalBoundary) {
    const index = raw.exclude?.indexOf("tests/qr/prd01/harness/main.ts") ?? -1;
    if (index < 0) throw new Error("Historical comparison boundary is missing from the source check config");
    raw.exclude = raw.exclude!.slice(0, index);
  }
  const parsed = ts.parseJsonConfigFileContent(raw, ts.sys, root, undefined, configPath);
  if (parsed.errors.length) throw new Error(ts.formatDiagnostics(parsed.errors, {
    getCanonicalFileName: (file) => file,
    getCurrentDirectory: () => root,
    getNewLine: () => "\n",
  }));
  return parsed;
}

function rootsOf(config: ts.ParsedCommandLine): Set<string> {
  return new Set(config.fileNames.map((file) => relative(root, file).split(sep).join("/")));
}

function testPaths(source: string): string[] {
  // Avoid matching a suffix such as packages/audio/tests/audio.test.ts.
  return [...new Set(Array.from(
    source.matchAll(/(?<![A-Za-z0-9_/.-])(tests\/[A-Za-z0-9_./-]+\.(?:test|spec)\.ts)\b/g),
    (match) => match[1],
  ))].sort();
}

function coverageIssues(paths: readonly string[], roots: ReadonlySet<string>, exists: (path: string) => boolean): string[] {
  return paths.flatMap((path) => !exists(path) ? [`missing: ${path}`] : !roots.has(path) ? [`not a checked root: ${path}`] : []);
}

function htmlReferences(source: string): string[] {
  return [...new Set(Array.from(source.matchAll(/tests\/browser\/[A-Za-z0-9_./-]+\.html\b/g), (match) => match[0]))];
}

interface HtmlSources { sources: string[]; missing: string[] }

function htmlSources(htmlPath: string, html: string, exists: (path: string) => boolean): HtmlSources {
  const urls: string[] = [];
  for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const src = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(script[1]);
    if (src) urls.push(src[1] ?? src[2] ?? src[3]);
    else urls.push(...ts.preProcessFile(script[2], true, true).importedFiles.map((entry) => entry.fileName));
  }
  const sources = new Set<string>();
  const missing = new Set<string>();
  for (const url of urls) {
    if (!url.startsWith(".") && !url.startsWith("/")) continue;
    const pathname = url.split(/[?#]/, 1)[0];
    const absolute = pathname.startsWith("/") ? resolve(root, `.${pathname}`) : resolve(root, dirname(htmlPath), pathname);
    const path = relative(root, absolute).split(sep).join("/");
    if (path.startsWith("../") || path.startsWith("node_modules/")) continue;
    if (path.endsWith(".ts")) {
      if (exists(path)) sources.add(path);
      else missing.add(path);
    } else if (path.endsWith(".js") && !exists(path)) {
      // The dev server serves a sibling TypeScript file for an absent .js URL.
      const source = path.replace(/\.js$/, ".ts");
      if (exists(source)) sources.add(source);
      else missing.add(path);
    }
  }
  return { sources: [...sources].sort(), missing: [...missing].sort() };
}

/** Trace checked roots through local TypeScript imports; exclude is not an import barrier. */
function graphBoundaryIssues(configs: readonly ts.ParsedCommandLine[], excluded: ReadonlySet<string>, projectRoot = root): string[] {
  const files = new Set(configs.flatMap((config) => config.fileNames.map((file) => resolve(file))));
  const queue: Array<{ file: string; from?: string }> = [...files].map((file) => ({ file }));
  const seen = new Set<string>();
  const issues = new Set<string>();
  const options = configs[0].options;
  const cache = ts.createModuleResolutionCache(projectRoot, (file) => file, options);
  const externalEngine = /^(?:three(?:\/|$)|\/node_modules\/three\/)/;
  const aliases = Object.keys(options.paths ?? {}).map((pattern) => {
    const [prefix, suffix] = pattern.split("*");
    return (specifier: string) => suffix === undefined ? specifier === prefix : specifier.startsWith(prefix) && specifier.endsWith(suffix);
  });
  while (queue.length) {
    const { file, from } = queue.pop()!;
    if (seen.has(file) || file.includes(`${sep}node_modules${sep}`) || !/\.(?:[cm]?ts|tsx)$/.test(file) || /\.d\.[cm]?ts$/.test(file)) continue;
    seen.add(file);
    const local = relative(projectRoot, file).split(sep).join("/");
    if (local.startsWith("../") || !existsSync(file)) continue;
    if (excluded.has(local)) issues.add(`excluded historical source is reached: ${local} (${from ? `imported by ${from}` : "checked root"})`);
    const source = readFileSync(file, "utf8");
    const noCheck = /^\s*\/\/\s*@ts-nocheck\b/m.test(source);
    for (const entry of ts.preProcessFile(source, true, true).importedFiles) {
      const specifier = entry.fileName;
      if (externalEngine.test(specifier)) {
        // Some retained historical tools already carry their own no-check marker;
        // they remain unchecked evidence, not source-check success.
        if (!noCheck || !/^tools\/threejs-parity-[^/]+\/index\.ts$/.test(local)) {
          issues.add(`unavailable historical dependency in ${local}: ${specifier}`);
        }
        continue;
      }
      // Follow relative imports and configured aliases, including imports
      // outside the configured root trees.
      if (!specifier.startsWith(".") && !specifier.startsWith("/") && !aliases.some((matches) => matches(specifier))) continue;
      const resolved = ts.resolveModuleName(specifier, file, options, ts.sys, cache).resolvedModule?.resolvedFileName;
      if (resolved && !resolved.includes(`${sep}node_modules${sep}`) && !files.has(resolve(resolved))) {
        files.add(resolve(resolved));
        queue.push({ file: resolve(resolved), from: local });
      }
    }
  }
  return [...issues].sort();
}

describe("native source typecheck inventory", () => {
  it("requires every roadmap and acceptance test path to exist and be a checked root", () => {
    const sources = [roadmap, acceptance].map((path) => readFileSync(resolve(root, path), "utf8"));
    const paths = [...new Set(sources.flatMap(testPaths))].sort();
    expect(paths.length).toBeGreaterThan(200);
    expect(paths).toEqual(expect.arrayContaining([
      "tests/browser/editor-authoring-external-parity.spec.ts",
      "tests/browser/native-geometry-query.spec.ts",
      "tests/browser/native-render-state.spec.ts",
      "tests/qr/prd04/unit/native-physical-shader-contract.test.ts",
    ]));
    const roots = new Set([...rootsOf(parseConfig(checkConfig)), ...rootsOf(parseConfig(browserConfig))]);
    expect(coverageIssues(paths, roots, (path) => existsSync(resolve(root, path)))).toEqual([]);
  });

  it("detects missing test paths and roots independently", () => {
    expect(coverageIssues(["tests/browser/a.spec.ts", "tests/browser/b.spec.ts"], new Set(["tests/browser/a.spec.ts"]), (path) => path.endsWith("b.spec.ts")))
      .toEqual(["missing: tests/browser/a.spec.ts", "not a checked root: tests/browser/b.spec.ts"]);
  });

  it("detects an excluded source reached through a transitive import", () => {
    const directory = mkdtempSync(join(tmpdir(), "a3d-inventory-"));
    try {
      writeFileSync(join(directory, "entry.ts"), 'import "@fixture/intermediate";');
      writeFileSync(join(directory, "intermediate.ts"), 'import("./excluded.js");');
      writeFileSync(join(directory, "excluded.ts"), '// @ts-nocheck\nimport "three";');
      const config: ts.ParsedCommandLine = {
        options: { moduleResolution: ts.ModuleResolutionKind.Bundler, module: ts.ModuleKind.ESNext, baseUrl: directory, paths: { "@fixture/*": ["./*"] } },
        fileNames: [join(directory, "entry.ts")],
        errors: [],
      };
      expect(graphBoundaryIssues([config], new Set(["excluded.ts"]), directory)).toEqual([
        "excluded historical source is reached: excluded.ts (imported by intermediate.ts)",
        "unavailable historical dependency in excluded.ts: three",
      ]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("checks TypeScript harnesses referenced by native browser HTML", () => {
    const roots = rootsOf(parseConfig(browserConfig));
    const specs = [...roots].filter((path) => path.startsWith("tests/browser/") && path.endsWith(".spec.ts"));
    const pages = [...new Set(specs.flatMap((path) => htmlReferences(readFileSync(resolve(root, path), "utf8"))))]
      .filter((path) => existsSync(resolve(root, path)));
    expect(pages.length).toBeGreaterThan(0);
    const harnesses = pages.map((path) => htmlSources(path, readFileSync(resolve(root, path), "utf8"), (source) => existsSync(resolve(root, source))));
    const missing = harnesses.flatMap((entry) => entry.missing);
    const sources = [...new Set(harnesses.flatMap((entry) => entry.sources))].sort();
    expect(sources).toEqual(expect.arrayContaining([
      "tests/browser/createAuraApp-animation-bridge-harness.ts",
      "tests/browser/input-browser-harness.ts",
      "tests/browser/root-sdf-text-g1-harness.ts",
    ]));
    expect(missing).toEqual([]);
    expect(coverageIssues(sources, roots, (path) => existsSync(resolve(root, path)))).toEqual([]);
  });

  it("finds relative, served JavaScript and inline module harness references", () => {
    const existing = new Set(["tests/browser/direct.ts", "tests/browser/served.ts", "tests/browser/inline.ts"]);
    const result = htmlSources("tests/browser/page.html", `
      <script type="module" src="./direct.ts?x=1"></script>
      <script src="/tests/browser/served.js"></script>
      <script type="module">import { run } from "./inline.ts"; run();</script>
      <script src="./missing.ts"></script>`, (path) => existing.has(path));
    expect(result).toEqual({ sources: [...existing].sort(), missing: ["tests/browser/missing.ts"] });
    expect(coverageIssues(result.sources, new Set(["tests/browser/direct.ts"]), (path) => existing.has(path)))
      .toEqual(["not a checked root: tests/browser/inline.ts", "not a checked root: tests/browser/served.ts"]);
  });

  it("keeps required source roots checked and never silently disables their errors", () => {
    const browser = parseConfig(browserConfig);
    const node = parseConfig(checkConfig);
    for (const config of [browser, node]) {
      expect(config.options.noEmit).toBe(true);
      expect(config.options.noCheck).not.toBe(true);
      expect(config.options.noResolve).not.toBe(true);
    }
    const browserRoots = rootsOf(browser);
    const nodeRoots = rootsOf(node);
    for (const path of [
      "tests/browser/editor-authoring-external-parity.spec.ts",
      "tests/browser/example-dev-server.ts",
      "tests/browser/resource-soak-u1.spec.ts",
      "tests/browser/native-worker-render-worker.ts",
      "tests/browser/createAuraApp-animation-bridge-harness.ts",
      "tests/browser/input-browser-harness.ts",
      "tests/browser/root-sdf-text-g1-harness.ts",
      "tests/visual/canvas-pixel-checks.ts",
    ]) expect(browserRoots.has(path), path).toBe(true);
    for (const path of [
      "packages/engine/src/public/index.ts",
      "tests/qr/prd04/unit/native-physical-shader-contract.test.ts",
      "tests/qr/prd06/unit/historical-registry-source.test.ts",
      "tests/qr/prd06/unit/perf-tier-scenes.test.ts",
      "tests/unit/tools/native-browser-source-inventory.test.ts",
      "tools/compare-engines/index.ts",
      "tools/bundle-scenarios/index.ts",
      "tools/native-consumer-matrix/index.ts",
      "tools/native-runtime-audit/index.ts",
    ]) expect(nodeRoots.has(path), path).toBe(true);
    // S5-WP19-07 decision (docs/prds/aura3d-5.0-scope.md, 2026-11-02): the vs-three.js bench is an
    // external comparison harness, never installed or typechecked here (tsconfig.check.json exclude).
    for (const path of [
      "tools/bench-vs-threejs/full-game/three/src/audio.ts",
      "tools/bench-vs-threejs/full-game/three/src/touch.ts",
      "tools/bench-vs-threejs/full-game/three/src/ui.ts",
    ]) {
      expect(existsSync(resolve(root, path)), path).toBe(true);
      expect(nodeRoots.has(path), path).toBe(false);
      expect(browserRoots.has(path), path).toBe(false);
    }
    for (const path of browserRoots) {
      if (path.startsWith("tests/browser/")) {
        expect(readFileSync(resolve(root, path), "utf8"), path).not.toMatch(/^\s*\/\/\s*@ts-nocheck\b/m);
      }
    }
  });

  it("keeps every native test and helper source in a checked root", () => {
    const nativeSources = ts.sys.readDirectory(resolve(root, "tests"), [".ts"],
      ["**/fixtures/**", "**/before/**", "**/after/**", "**/reports/**"], ["**/native-*.ts"])
      .filter((path) => !/\.d\.[cm]?ts$/.test(path))
      .map((path) => relative(root, path).split(sep).join("/"));
    expect(nativeSources.length).toBeGreaterThan(100);
    const roots = new Set([...rootsOf(parseConfig(checkConfig)), ...rootsOf(parseConfig(browserConfig))]);
    expect(coverageIssues(nativeSources, roots, (path) => existsSync(resolve(root, path)))).toEqual([]);
  });

  it("keeps excluded historical entrypoints out of the transitive checked graphs", () => {
    const node = parseConfig(checkConfig);
    const browser = parseConfig(browserConfig);
    const before = rootsOf(parseConfig(checkConfig, false));
    const after = rootsOf(node);
    const excluded = new Set([...before].filter((path) => !after.has(path)));
    expect(excluded.size).toBeGreaterThan(0);
    expect([...excluded].some((path) => path.startsWith("packages/") || /(?:^|\/)native-[^/]*\.ts$/.test(path))).toBe(false);
    expect(graphBoundaryIssues([node, browser], excluded)).toEqual([]);
  }, 60_000);
});
