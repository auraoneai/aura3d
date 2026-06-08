import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { addAsset, initAgentFiles, inspectAsset, listAssets, validateAssets, validateAnimationStudioAssets, validateGameAssets } from "../../../packages/aura3d-cli/src";

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

  test("fighting-character game profile accepts a rigged animated fighter with provenance", () => {
    const projectDir = createProject();
    writeFileSync(join(projectDir, "assets", "fighter.gltf"), JSON.stringify(createAnimatedCharacterGltf({
      clips: ["Idle_Loop", "Walk_Loop", "Punch_Jab"]
    })));
    addAsset({
      projectDir,
      file: "assets/fighter.gltf",
      name: "profileFighter",
      license: "CC0-1.0",
      author: "Fixture Author",
      sourceUrl: "https://example.test/profile-fighter",
      sourceFamily: "test-fixture"
    });

    const report = validateGameAssets({
      projectDir,
      gameProfile: "fighting-character",
      assetIds: ["profileFighter"]
    });

    expect(report.ok).toBe(true);
    expect(report.profile).toBe("game");
    expect(report.gameProfile).toBe("fighting-character");
    expect(report.assets[0]?.gameReady).toBe(true);
  });

  test("fighting-character game profile skips non-fighter models in mixed game manifests", () => {
    const projectDir = createProject();
    writeFileSync(join(projectDir, "assets", "player.gltf"), JSON.stringify(createAnimatedCharacterGltf({
      clips: ["Idle_Loop", "Walk_Loop", "Punch_Jab"]
    })));
    const rivalGltf = createAnimatedCharacterGltf({
      clips: ["Idle_Loop", "Walk_Loop", "Punch_Jab"]
    });
    (rivalGltf.materials as { name: string }[])[0] = { name: "rival-body" };
    writeFileSync(join(projectDir, "assets", "rival.gltf"), JSON.stringify(rivalGltf));
    writeFileSync(join(projectDir, "assets", "arena.gltf"), JSON.stringify({
      asset: {
        version: "2.0",
        extras: {
          aura3d: {
            provenance: {
              license: "CC0-1.0",
              sourceUrl: "https://example.test/arena-stage",
              sourceFamily: "test-fixture"
            }
          }
        }
      },
      materials: [{ name: "stage" }],
      nodes: [{ name: "ArenaStage", mesh: 0 }],
      meshes: [{ primitives: [{}] }],
      accessors: [{ min: [-4, 0, -2], max: [4, 2, 2] }]
    }));

    addAsset({
      projectDir,
      file: "assets/player.gltf",
      name: "playerFighter",
      license: "CC0-1.0",
      author: "Fixture Author",
      sourceUrl: "https://example.test/player-fighter",
      sourceFamily: "test-fixture"
    });
    addAsset({
      projectDir,
      file: "assets/rival.gltf",
      name: "rivalFighter",
      license: "CC0-1.0",
      author: "Fixture Author",
      sourceUrl: "https://example.test/rival-fighter",
      sourceFamily: "test-fixture"
    });
    addAsset({
      projectDir,
      file: "assets/arena.gltf",
      name: "arenaStage",
      license: "CC0-1.0",
      author: "Fixture Author",
      sourceUrl: "https://example.test/arena-stage",
      sourceFamily: "test-fixture"
    });

    const report = validateGameAssets({
      projectDir,
      gameProfile: "fighting-character",
      noPlaceholders: true,
      requireLicense: true
    });

    expect(report.ok).toBe(true);
    expect(report.summary.profileTargetAssets).toBe(2);
    expect(report.summary.profileReadyAssets).toBe(2);
    expect(report.summary.profileSkippedAssets).toBe(1);
    expect(report.assets.find((asset) => asset.id === "arenaStage")).toMatchObject({
      profileTarget: false,
      profileSkippedReason: expect.stringContaining("Skipped by fighting-character profile")
    });
    expect(report.failures.join("\n")).not.toContain("arenaStage");
  });

  test("fighting-character full-manifest validation fails with fewer than two distinct release-ready fighters", () => {
    const projectDir = createProject();
    writeFileSync(join(projectDir, "assets", "fighter.gltf"), JSON.stringify(createAnimatedCharacterGltf({
      clips: ["Idle_Loop", "Walk_Loop", "Punch_Jab"]
    })));
    writeFileSync(join(projectDir, "assets", "arena.gltf"), JSON.stringify({
      asset: { version: "2.0" },
      materials: [{ name: "stage" }],
      nodes: [{ name: "ArenaStage", mesh: 0 }],
      meshes: [{ primitives: [{}] }],
      accessors: [{ min: [-4, 0, -2], max: [4, 2, 2] }]
    }));

    addAsset({
      projectDir,
      file: "assets/fighter.gltf",
      name: "profileFighter",
      license: "CC0-1.0",
      author: "Fixture Author",
      sourceUrl: "https://example.test/profile-fighter",
      sourceFamily: "test-fixture"
    });
    addAsset({ projectDir, file: "assets/arena.gltf", name: "arenaStage" });

    const report = validateGameAssets({
      projectDir,
      gameProfile: "fighting-character"
    });

    expect(report.ok).toBe(false);
    expect(report.summary.profileTargetAssets).toBe(1);
    expect(report.summary.profileReadyAssets).toBe(1);
    expect(report.summary.profileSkippedAssets).toBe(1);
    expect(report.failures.join("\n")).toContain("requires at least 2 distinct typed fighter assets");
    expect(report.failures.join("\n")).toContain("found only 1 release-ready fighter asset");
    expect(report.failures.join("\n")).not.toContain("arenaStage");
  });

  test("fighting-character game profile rejects static non-rigged candidates with reasons", () => {
    const projectDir = createProject();
    writeFileSync(join(projectDir, "assets", "static-prop.gltf"), JSON.stringify({
      asset: {
        version: "2.0",
        extras: {
          aura3d: {
            provenance: {
              license: "CC0-1.0",
              sourceUrl: "https://example.test/static-prop",
              sourceFamily: "test-fixture"
            }
          }
        }
      },
      materials: [{ name: "prop" }],
      nodes: [{ name: "StaticProp", mesh: 0 }],
      meshes: [{ primitives: [{}] }],
      images: [{ uri: "data:image/png;base64,AA==" }],
      accessors: [{ min: [-0.25, 0, -0.25], max: [0.25, 0.4, 0.25] }]
    }));
    addAsset({
      projectDir,
      file: "assets/static-prop.gltf",
      name: "staticProp",
      license: "CC0-1.0",
      sourceUrl: "https://example.test/static-prop",
      sourceFamily: "test-fixture"
    });

    const report = validateGameAssets({
      projectDir,
      gameProfile: "fighting-character",
      assetIds: ["staticProp"]
    });

    expect(report.ok).toBe(false);
    expect(report.failures.join("\n")).toContain("fighting-character profile requires embedded animation clips");
    expect(report.failures.join("\n")).toContain("requires humanoid metadata");
    expect(report.failures.join("\n")).toContain("height 0.4m is too small");
    expect(report.assets[0]?.gameReady).toBe(false);
  });

  test("fighting-character game profile rejects rigged animated IP-risk candidates", () => {
    const projectDir = createProject();
    writeFileSync(join(projectDir, "assets", "fan-fighter.gltf"), JSON.stringify(createAnimatedCharacterGltf({
      clips: ["Idle_Loop", "Walk_Loop", "Punch_Jab"]
    })));
    addAsset({
      projectDir,
      file: "assets/fan-fighter.gltf",
      name: "marioFanFighter",
      license: "CC0-1.0",
      author: "Fixture Author",
      sourceUrl: "https://example.test/mario-fan-art-fighter",
      sourceFamily: "test-fixture"
    });

    const report = validateGameAssets({
      projectDir,
      gameProfile: "fighting-character",
      assetIds: ["marioFanFighter"]
    });

    expect(report.ok).toBe(false);
    expect(report.failures.join("\n")).toContain("IP-risk metadata");
    expect(report.assets[0]?.gameReady).toBe(false);
  });

  test("animation episode validation accepts two distinct characters plus one set with mouth and provenance readiness", () => {
    const projectDir = createProject();
    writeFileSync(join(projectDir, "assets", "miko.gltf"), JSON.stringify(createAnimatedCharacterGltf({
      clips: ["Idle", "Talk", "Wave"]
    })));
    const lumaGltf = createAnimatedCharacterGltf({
      clips: ["Idle", "Talk", "Point"]
    });
    (lumaGltf.materials as { name: string }[])[0] = { name: "luma-body" };
    writeFileSync(join(projectDir, "assets", "luma.gltf"), JSON.stringify(lumaGltf));
    writeFileSync(join(projectDir, "assets", "moon-garden-set.gltf"), JSON.stringify(createAnimationSetGltf()));

    addAsset({
      projectDir,
      file: "assets/miko.gltf",
      name: "miko",
      license: "CC0-1.0",
      author: "Fixture Author",
      sourceUrl: "https://example.test/miko-animation-character",
      sourceFamily: "test-fixture"
    });
    addAsset({
      projectDir,
      file: "assets/luma.gltf",
      name: "luma",
      license: "CC0-1.0",
      author: "Fixture Author",
      sourceUrl: "https://example.test/luma-animation-character",
      sourceFamily: "test-fixture"
    });
    addAsset({
      projectDir,
      file: "assets/moon-garden-set.gltf",
      name: "moonGarden",
      license: "CC0-1.0",
      author: "Fixture Author",
      sourceUrl: "https://example.test/moon-garden-set",
      sourceFamily: "test-fixture"
    });

    const report = validateAnimationStudioAssets({
      projectDir,
      episode: true,
      noPlaceholders: true,
      requireLicense: true,
      output: "artifacts/aura3d/animation-assets.json"
    });

    expect(report.ok).toBe(true);
    expect(report.animationEpisode).toMatchObject({
      enabled: true,
      ok: true,
      selectedSets: ["moonGarden"],
      assetProvenanceArtifact: "artifacts/aura3d/asset-provenance.json"
    });
    expect(report.animationEpisode?.selectedCharacters).toEqual(expect.arrayContaining(["miko", "luma"]));
    expect(report.summary).toMatchObject({
      animationCharacters: 2,
      animationSets: 1,
      episodeReadyCharacters: 2,
      mouthReadyCharacters: 2,
      animationReadyCharacters: 2
    });
    expect(report.animationEpisode?.readiness.find((entry) => entry.id === "miko")).toMatchObject({
      role: "character",
      episodeReady: true,
      mouthMode: "blendshape-lip-sync"
    });
  });

  test("animation-studio template manifest passes strict episode asset validation", () => {
    const projectDir = join(process.cwd(), "packages/create-aura3d/templates/animation-studio");

    const report = validateAnimationStudioAssets({
      projectDir,
      episode: true,
      noPlaceholders: true,
      requireLicense: true
    });

    expect(report.ok).toBe(true);
    expect(report.animationEpisode).toMatchObject({
      enabled: true,
      ok: true,
      selectedSets: ["moonGarden"]
    });
    expect(report.animationEpisode?.selectedCharacters).toEqual(expect.arrayContaining(["miko", "luma"]));
    expect(report.summary).toMatchObject({
      animationCharacters: 2,
      animationSets: 1,
      episodeReadyCharacters: 2,
      mouthReadyCharacters: 2,
      animationReadyCharacters: 2
    });
    expect(report.warnings.join("\n")).toContain("no typed audio assets");
  });

  test("animation episode validation rejects missing set, duplicate characters, and missing mouth readiness", () => {
    const projectDir = createProject();
    writeFileSync(join(projectDir, "assets", "static-body.gltf"), JSON.stringify(createAnimatedCharacterGltf({
      clips: ["Idle"]
    }, { mouth: false })));

    addAsset({
      projectDir,
      file: "assets/static-body.gltf",
      name: "miko",
      license: "CC0-1.0",
      author: "Fixture Author",
      sourceUrl: "https://example.test/miko-animation-character",
      sourceFamily: "test-fixture"
    });
    addAsset({
      projectDir,
      file: "assets/static-body.gltf",
      name: "luma",
      license: "CC0-1.0",
      author: "Fixture Author",
      sourceUrl: "https://example.test/luma-animation-character",
      sourceFamily: "test-fixture"
    });

    const report = validateAnimationStudioAssets({
      projectDir,
      episode: true,
      noPlaceholders: true,
      requireLicense: true
    });

    expect(report.ok).toBe(false);
    expect(report.animationEpisode?.ok).toBe(false);
    expect(report.failures.join("\n")).toContain("requires distinct character files/hashes");
    expect(report.failures.join("\n")).toContain("requires at least 1 typed animation set/location asset");
    expect(report.failures.join("\n")).toContain("requires blendshape, mouth-card, viseme, talk, face, or primitive mouth fallback metadata");
    expect(report.summary).toMatchObject({
      animationCharacters: 2,
      animationSets: 0,
      mouthReadyCharacters: 0
    });
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

function createAnimatedCharacterGltf(
  options: { readonly provenance?: boolean; readonly clips?: readonly string[] } = {},
  readiness: { readonly mouth?: boolean } = {}
): Record<string, unknown> {
  const includeProvenance = options.provenance !== false;
  const clips = options.clips ?? ["Idle"];
  const includeMouth = readiness.mouth !== false;
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
        ...(includeMouth ? { extras: { targetNames: ["Smile", "AA"] } } : {}),
        primitives: includeMouth ? [{ targets: [{}, {}] }] : [{}]
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

function createAnimationSetGltf(): Record<string, unknown> {
  return {
    asset: {
      version: "2.0",
      extras: {
        aura3d: {
          provenance: {
            license: "CC0-1.0",
            author: "Fixture Author",
            sourceUrl: "https://example.test/moon-garden-set",
            sourceFamily: "test-fixture"
          }
        }
      }
    },
    materials: [{ name: "moonGardenToon" }],
    nodes: [{ name: "MoonGardenWalkableSet", mesh: 0 }],
    meshes: [{ primitives: [{}] }],
    images: [{ uri: "data:image/png;base64,AA==" }],
    accessors: [{ min: [-4, 0, -3], max: [4, 2, 3] }]
  };
}
