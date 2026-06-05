import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { addAsset, initAgentFiles, inspectAsset, listAssets, validateAssets, validateGameAssets } from "../../../packages/aura3d-cli/src";

describe("@aura3d/cli assets", () => {
  test("adds a glTF asset, writes manifest, and generates typed imports", () => {
    const projectDir = createProject();
    writeFileSync(join(projectDir, "assets", "robot.gltf"), JSON.stringify({
      asset: { version: "2.0" },
      materials: [{ name: "body" }],
      animations: [{ name: "idle" }],
      images: [{ uri: "color.png" }],
      accessors: [{ min: [-1, 0, -1], max: [1, 2, 1] }]
    }));
    writeFileSync(join(projectDir, "assets", "color.png"), "texture");
    const result = addAsset({ projectDir, file: "assets/robot.gltf", name: "robot" });
    expect(result.ok).toBe(true);
    expect(listAssets({ projectDir })[0]).toMatchObject({ id: "robot", format: "gltf", bounds: [2, 2, 2] });
    expect(readFileSync(join(projectDir, "src", "aura-assets.ts"), "utf8")).toContain("defineAuraAssets");
    expect(validateAssets({ projectDir }).ok).toBe(true);
  });

  test("records provenance plus animation, skeleton, and morph metadata for typed assets", () => {
    const projectDir = createProject();
    writeFileSync(join(projectDir, "assets", "fighter.gltf"), JSON.stringify(createAnimatedCharacterGltf()));

    const result = addAsset({
      projectDir,
      file: "assets/fighter.gltf",
      name: "fighter",
      license: "CC0-1.0",
      author: "Quaternius",
      sourceUrl: "https://quaternius.com/packs/universalbasecharacters.html",
      sourceFamily: "Quaternius"
    });

    expect(result.ok).toBe(true);
    const asset = listAssets({ projectDir })[0];
    expect(asset).toMatchObject({
      id: "fighter",
      provenance: {
        license: "CC0-1.0",
        author: "Quaternius",
        sourceFamily: "Quaternius"
      },
      skeleton: {
        skinCount: 1,
        jointCount: 7
      },
      morphTargets: {
        targetNames: ["Smile", "AA"]
      }
    });
    expect(asset?.animationMetadata?.clips[0]).toMatchObject({
      name: "Idle",
      channelCount: 1,
      samplerCount: 1
    });

    const typedAssets = readFileSync(join(projectDir, "src", "aura-assets.ts"), "utf8");
    expect(typedAssets).toContain('"provenance"');
    expect(typedAssets).toContain('"skeleton"');
    expect(typedAssets).toContain('"morphTargets"');
    expect(validateAssets({ projectDir, noPlaceholders: true, requireLicense: true }).ok).toBe(true);

    const inspection = inspectAsset({
      projectDir,
      file: "assets/fighter.gltf",
      animation: true,
      humanoid: true,
      skeleton: true,
      morphs: true,
      license: true
    });
    expect(inspection.animation?.clipCount).toBe(1);
    expect(inspection.skeleton?.jointCount).toBe(7);
    expect(inspection.morphTargets?.targetNames).toEqual(["Smile", "AA"]);
    expect(inspection.provenance?.license).toBe("CC0-1.0");
  });

  test("strict validation rejects placeholder assets and missing license evidence", () => {
    const projectDir = createProject();
    writeFileSync(join(projectDir, "assets", "placeholder-fighter.gltf"), JSON.stringify(createAnimatedCharacterGltf({ provenance: false })));
    addAsset({ projectDir, file: "assets/placeholder-fighter.gltf", name: "placeholderFighter" });

    const strict = validateAssets({ projectDir, noPlaceholders: true, requireLicense: true });
    expect(strict.ok).toBe(false);
    expect(strict.failures.join("\n")).toContain("Placeholder asset is not allowed");
    expect(strict.failures.join("\n")).toContain("Missing license/provenance evidence");
  });

  test("strict validation accepts Aura Clash style sidecar provenance", () => {
    const projectDir = createProject();
    writeFileSync(join(projectDir, "assets", "fighter.gltf"), JSON.stringify(createAnimatedCharacterGltf()));
    const result = addAsset({ projectDir, file: "assets/fighter.gltf", name: "fighterMaraVolt" });
    const asset = result.manifest.assets.find((entry) => entry.id === "fighterMaraVolt");
    expect(asset).toBeDefined();

    writeFileSync(join(projectDir, "asset-evidence.json"), JSON.stringify({
      schema: "aura-clash.launch-asset-evidence/1.0",
      updatedAt: "2026-06-04",
      launchGlbs: [
        {
          assetKey: "fighterMaraVolt",
          typedAsset: "assets.fighterMaraVolt",
          sourcePath: "apps/aura-clash-showcase/assets/source/fighters/fighter-mara-volt.glb",
          publicUrl: asset?.url,
          hash: asset?.hash,
          licenseNote: "Derived from official Quaternius assets; CC0 1.0 Universal / Public Domain Dedication.",
          provenance: {
            sourcePack: "universal-base-characters",
            sourceArchiveSha256: "sha256-test"
          },
          intendedRouteUsage: ["/playable/", "/evidence/"]
        }
      ]
    }));

    const strict = validateAssets({
      projectDir,
      noPlaceholders: true,
      requireLicense: true,
      provenanceFile: "asset-evidence.json"
    });
    expect(strict.ok).toBe(true);
  });

  test("game readiness can validate an explicit shipping asset set", () => {
    const projectDir = createProject();
    writeFileSync(join(projectDir, "assets", "shipping-fighter.gltf"), JSON.stringify(createAnimatedCharacterGltf({
      clips: ["Idle_Loop", "Walk_Loop", "Punch_Jab"]
    })));
    writeFileSync(join(projectDir, "assets", "bad-candidate.gltf"), JSON.stringify({
      asset: { version: "2.0" },
      materials: [{ name: "debug" }],
      nodes: [{ name: "OversizedCandidate" }],
      accessors: [{ min: [-100, -100, -100], max: [100, 100, 100] }]
    }));

    addAsset({ projectDir, file: "assets/shipping-fighter.gltf", name: "shippingFighter" });
    addAsset({ projectDir, file: "assets/bad-candidate.gltf", name: "badCandidate" });

    const fullReport = validateGameAssets({ projectDir });
    expect(fullReport.ok).toBe(false);
    expect(fullReport.failures.join("\n")).toContain("badCandidate");

    const shippingReport = validateGameAssets({ projectDir, assetIds: ["shippingFighter"] });
    expect(shippingReport.ok).toBe(true);
    expect(shippingReport.summary.totalAssets).toBe(1);
    expect(shippingReport.assets.map((asset) => asset.id)).toEqual(["shippingFighter"]);
  });

  test("writes agent instruction files", () => {
    const projectDir = createProject();
    const written = initAgentFiles({ projectDir, agent: "all" });
    expect(written.map((path) => path.replace(projectDir, ""))).toEqual([
      "/AGENTS.md",
      "/.claude/CLAUDE.md",
      "/.cursor/rules/aura3d.mdc",
      "/.github/copilot-instructions.md"
    ]);
  });
});

function createProject(): string {
  const projectDir = join(tmpdir(), `aura3d-cli-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(join(projectDir, "assets"), { recursive: true });
  writeFileSync(join(projectDir, "package.json"), JSON.stringify({ type: "module" }));
  return projectDir;
}

function createAnimatedCharacterGltf(options: { readonly provenance?: boolean; readonly clips?: readonly string[] } = {}): Record<string, unknown> {
  const includeProvenance = options.provenance !== false;
  const clips = options.clips ?? ["Idle"];
  return {
    asset: {
      version: "2.0",
      extras: {
        aura3d: {
          ...(includeProvenance
            ? {
                provenance: {
                  license: "CC0-1.0",
                  author: "Fixture Author",
                  sourceUrl: "https://example.test/fighter",
                  sourceFamily: "test-fixture"
                }
              }
            : {}),
          orientation: {
            forwardAxis: "+z",
            upAxis: "+y"
          }
        }
      }
    },
    materials: [{ name: "body" }],
    meshes: [
      {
        name: "Face",
        extras: { targetNames: ["Smile", "AA"] },
        primitives: [{ targets: [{}, {}] }]
      }
    ],
    nodes: [
      { name: "Hips", mesh: 0, skin: 0 },
      { name: "Spine" },
      { name: "Head" },
      { name: "LeftArm" },
      { name: "RightArm" },
      { name: "LeftLeg" },
      { name: "RightLeg" }
    ],
    skins: [{ name: "Humanoid", joints: [0, 1, 2, 3, 4, 5, 6], skeleton: 0 }],
    animations: clips.map((name) => ({
      name,
      channels: [{ sampler: 0, target: { node: 1, path: "rotation" } }],
      samplers: [{}]
    })),
    images: [{ uri: "data:image/png;base64,AA==" }],
    accessors: [{ min: [-1, 0, -1], max: [1, 2, 1] }]
  };
}
