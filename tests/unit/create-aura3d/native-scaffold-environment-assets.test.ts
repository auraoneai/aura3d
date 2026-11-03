import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { createA3DProject } from "../../../packages/create-aura3d/src/index.js";
import { TEMPLATE_ENVIRONMENT_PRESETS } from "../../../packages/create-aura3d/src/template-hdri.js";
import { defaultProbeLoader } from "../../../packages/rendering/src/environment/EnvironmentCache.js";

const packageRoot = resolve("packages/create-aura3d");
const scratch = mkdtempSync(join(tmpdir(), "aura-scaffold-environments-"));
const sha256 = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");

interface PresetManifest {
  name: string;
  specular: string;
  sh9: string;
  sha256: { specular: string; sh9: string };
  license: string;
  tags: string[];
  provenance: {
    sourceAsset: string;
    sourceAssetSha256: string;
    sourceLicense: string;
    sourceUri: string;
    bakeOrigin: string;
    sourceRecord: string;
    bakeCommit: string;
    pipelineIndependenceVerified: boolean;
    aliasOf?: string;
    note?: string;
  };
}

const sources: Readonly<Record<string, string>> = {
  studio: "studio_small_08_1k.hdr",
  outdoor: "autumn_field_puresky_1k.hdr",
  sunset: "kloppenheim_06_puresky_1k.hdr",
  night: "kloppenheim_06_puresky_1k.hdr",
  indoor: "studio_small_08_1k.hdr"
};

function manifest(dir: string, name: string): PresetManifest {
  return JSON.parse(readFileSync(join(dir, `${name}.manifest.json`), "utf8")) as PresetManifest;
}

afterEach(() => vi.unstubAllGlobals());
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe("scaffolded local environment probes", () => {
  it("packages the promised assets with matching digests and traceable CC0 source images", () => {
    const pkg = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as { files: string[] };
    expect(pkg.files).toContain("aura-environments");
    const attribution = readFileSync(join(packageRoot, "hdri/ATTRIBUTION.md"), "utf8");
    const dir = join(packageRoot, "aura-environments");
    for (const name of TEMPLATE_ENVIRONMENT_PRESETS) {
      const m = manifest(dir, name);
      expect(m.name).toBe(name);
      expect(m.license).toBe("CC0");
      expect(m.provenance.sourceLicense).toBe("CC0-1.0");
      expect(m.provenance.bakeOrigin).toBe("historical-aura-bake");
      expect(m.provenance.pipelineIndependenceVerified).toBe(false);
      expect(m.provenance.sourceRecord).toBe("packages/engine/src/devtools/environments/EnvironmentRegistry.ts");
      expect(m.provenance.bakeCommit).toBe("45b2923f52f829fad700127befa035706780f2de");
      expect(m.provenance.sourceAsset).toBe(`../hdri/${sources[name]}`);
      const sourceHash = sha256(readFileSync(join(packageRoot, "hdri", sources[name]!)));
      expect(m.provenance.sourceAssetSha256).toBe(sourceHash);
      expect(attribution).toContain(sourceHash);
      expect(attribution).toContain(m.provenance.sourceUri);
      for (const kind of ["specular", "sh9"] as const) {
        expect(m[kind]).toBe(`${name}.${kind === "specular" ? "specular.ktx2" : "sh9.f32"}`);
        expect(sha256(readFileSync(join(dir, m[kind])))).toBe(m.sha256[kind]);
      }
      if (name !== "indoor") {
        const original = manifest(resolve("public/aura-environments"), name);
        expect(m.sha256).toEqual(original.sha256);
      }
    }
  });

  it("labels indoor as a studio-source stand-in with identical probe data", () => {
    const dir = join(packageRoot, "aura-environments");
    const studio = manifest(dir, "studio");
    const indoor = manifest(dir, "indoor");
    expect(indoor.tags).toContain("studio-source-alias");
    expect(indoor.provenance.aliasOf).toBe("studio");
    expect(indoor.provenance.note).toMatch(/distinct independently sourced indoor bake is not included/i);
    expect(indoor.sha256).toEqual(studio.sha256);
    expect(sha256(readFileSync(join(dir, indoor.specular)))).toBe(sha256(readFileSync(join(dir, studio.specular))));
    expect(sha256(readFileSync(join(dir, indoor.sh9)))).toBe(sha256(readFileSync(join(dir, studio.sh9))));
    const readme = readFileSync(join(dir, "README.md"), "utf8");
    expect(readme).toMatch(/indoor.*studio.*stand-in/i);
    expect(readme).toMatch(/independence of the\s+complete historical bake pipeline has not been established/i);
    expect(readme).toMatch(/independent\s+rebake from the recorded inputs remains required/i);
  });

  it("scaffolds a real look-authoring template and loads its indoor alias through the source probe loader", async () => {
    const targetDir = join(scratch, "product-viewer");
    const result = createA3DProject({ targetDir, template: "product-viewer", rootDir: packageRoot });
    const dir = join(targetDir, "public/aura-environments");
    for (const name of TEMPLATE_ENVIRONMENT_PRESETS) {
      const m = manifest(dir, name);
      for (const file of [`${name}.manifest.json`, m.specular, m.sh9]) {
        expect(result.files).toContain(`public/aura-environments/${file}`);
        expect(sha256(readFileSync(join(dir, file)))).toBe(sha256(readFileSync(join(packageRoot, "aura-environments", file))));
      }
    }
    const fetched: string[] = [];
    vi.stubGlobal("fetch", async (input: string | URL | Request) => {
      const path = typeof input === "string" ? input : input instanceof URL ? input.pathname : new URL(input.url).pathname;
      fetched.push(path);
      const bytes = readFileSync(join(targetDir, "public", path));
      return new Response(Uint8Array.from(bytes));
    });
    const probe = await defaultProbeLoader({} as never)({ preset: "indoor", tier: "medium" });
    try {
      expect(fetched).toEqual([
        "/aura-environments/indoor.manifest.json",
        "/aura-environments/indoor.specular.ktx2",
        "/aura-environments/indoor.sh9.f32"
      ]);
      expect(probe.source).toBe("preset");
      expect(probe.faceSize).toBe(256);
      expect(probe.mipCount).toBe(5);
      expect(probe.sh9).toHaveLength(27);
      expect([...probe.sh9].every(Number.isFinite)).toBe(true);
    } finally {
      probe.dispose();
    }
  });
});
