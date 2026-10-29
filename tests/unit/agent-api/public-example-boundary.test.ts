import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PUBLIC_TEMPLATE_ROOTS = [
  "templates/mini-game",
  "templates/racing-starter",
  "templates/falling-blocks-starter",
  "packages/create-aura3d/templates/mini-game",
  "packages/create-aura3d/templates/racing-starter",
  "packages/create-aura3d/templates/falling-blocks-starter"
];

function publicSourceRoots(): string[] {
  const roots: string[] = [];
  const appsRoot = resolve(process.cwd(), "apps");
  if (existsSync(appsRoot)) {
    for (const entry of readdirSync(appsRoot)) {
      if (entry.startsWith("showcase-")) roots.push(join("apps", entry));
    }
  }
  for (const root of PUBLIC_TEMPLATE_ROOTS) {
    if (existsSync(resolve(process.cwd(), root))) roots.push(root);
  }
  return roots;
}

function walkSourceFiles(root: string): string[] {
  const absoluteRoot = resolve(process.cwd(), root);
  const files: string[] = [];
  const visit = (current: string) => {
    const relativePath = relative(process.cwd(), current);
    if (relativePath.includes("node_modules") || relativePath.includes("/dist/")) return;
    const stat = statSync(current);
    if (stat.isDirectory()) {
      // Asset registration and evidence-generation scripts are pipeline
      // inputs. They may name raw upstream model URLs so the CLI can validate
      // and generate typed route assets; they are not shipped visual source.
      // App-local `tools/` (for example far-LOD baking) is the same kind of build-time input.
      if (current !== absoluteRoot && (current.endsWith(`${join("", "scripts")}`) || current.endsWith(`${join("", "tools")}`))) return;
      // Candidate and art-review folders are also pipeline-only inputs. They
      // contain acquisition previews and rejected art options, never shipped
      // route source; scanning them as public examples turns an intentional
      // review URL into a false boundary violation.
      const directoryName = current.split(/[\\/]/).at(-1) ?? "";
      if (current !== absoluteRoot && ["art-candidates", "art-review", ".candidate-assets"].includes(directoryName)) return;
      // `public/` holds served payloads — vendored engine bundles, decoder
      // workers, audio/textures — shipped artifacts like `dist/` output, not
      // authored source the import boundary polices.
      if (current !== absoluteRoot && directoryName === "public") return;
      for (const entry of readdirSync(current)) visit(join(current, entry));
      return;
    }
    if (!/\.[cm]?[jt]sx?$/.test(current)) return;
    // Generated typed-asset catalogues, including per-app shards such as aura-assets.shared.ts.
    if (/[\\/]aura-assets(?:\.[\w-]+)?\.ts$/.test(current)) return;
    files.push(relativePath);
  };
  visit(absoluteRoot);
  return files;
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

// A raw GLB/glTF literal is sanctioned only inside a typed-asset definition —
// the `url`/`colliderUrl`/`source`/`mobile` fields of a `defineAuraAssets`
// manifest (whether the manifest lives in `aura-assets*.ts`/`aura-catalog.ts`
// or inline in the route source). The same literal anywhere else — a loader
// argument, a concatenated path, a `model("…")` payload — stays a violation.
const RAW_ASSET_URL = /["'`](?:https?:\/\/|\/|\.{1,2}\/)[^"'`]*\.(?:glb|gltf)(?:[?#][^"'`]*)?["'`]/gi;
const TYPED_ASSET_FIELD = /(?:url|colliderUrl|source|mobile)\s*:\s*(?:new\s+URL\(\s*)?$/;

describe("public example source boundary", () => {
  it("does not import renderer internals or raw model assets for public showcase/template visuals", () => {
    const files = publicSourceRoots().flatMap(walkSourceFiles);
    expect(files.length).toBeGreaterThan(0);

    const violations: string[] = [];
    for (const file of files) {
      const source = stripComments(readFileSync(resolve(process.cwd(), file), "utf8"));
      const checks: Array<[RegExp, string]> = [
        [
          /from\s+["'](?:@aura3d\/rendering|@aura3d\/assets|@aura3d\/engine\/(?:production-runtime|advanced-runtime|rendering|assets)|three(?:\/[^"']*)?)["']/,
          "renderer or three internals import"
        ],
        [/\bGLTFLoader\b/, "GLTFLoader usage"],
        [/\bunsafeModelUrl\s*\(/, "unsafeModelUrl usage"],
        [/\bmodel\s*\(\s*["'`]/, "raw string model asset"]
      ];

      for (const [pattern, label] of checks) {
        if (pattern.test(source)) violations.push(`${file}: ${label}`);
      }

      RAW_ASSET_URL.lastIndex = 0;
      let rawUrl: RegExpExecArray | null;
      while ((rawUrl = RAW_ASSET_URL.exec(source)) !== null) {
        const lineStart = source.lastIndexOf("\n", rawUrl.index) + 1;
        if (!TYPED_ASSET_FIELD.test(source.slice(lineStart, rawUrl.index))) {
          violations.push(`${file}: raw GLB/glTF URL outside generated typed assets`);
          break;
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
