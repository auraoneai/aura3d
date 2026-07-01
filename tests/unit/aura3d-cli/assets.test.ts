import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { describe, expect, test } from "vitest";
import { addAsset, initAgentFiles, inspectAsset, listAssets, readRenderedProbeMetadata, validateAssets, validateAnimationStudioAssets, validateGameAssets } from "../../../packages/aura3d-cli/src";

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
      licenseName: "CC0 1.0 Universal",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      licenseRaw: "CC0",
      author: "Quaternius",
      sourcePage: "https://quaternius.com/packs/universalbasecharacters.html",
      downloadUrl: "https://quaternius.com/files/universal-base-characters.zip",
      sourceUrl: "https://quaternius.com/packs/universalbasecharacters.html",
      sourceFamily: "Quaternius",
      retrievedAt: "2026-06-18T00:00:00.000Z",
      quality: "release",
      role: "character",
      suitabilityReason: "Readable rigged character with named material, texture, bounds, orientation, and durable provenance.",
      renderedProbe: {
        url: "/aura-assets/fighter.probe.png",
        kind: "browser-screenshot",
        renderer: "createAuraApp",
        width: 1280,
        height: 720,
        checkedAt: "2026-06-18T00:00:00.000Z"
      }
    });

    expect(result.ok).toBe(true);
    const asset = listAssets({ projectDir })[0];
    expect(asset).toMatchObject({
      id: "fighter",
      provenance: {
        sourcePage: "https://quaternius.com/packs/universalbasecharacters.html",
        downloadUrl: "https://quaternius.com/files/universal-base-characters.zip",
        license: "CC0-1.0",
        licenseName: "CC0 1.0 Universal",
        licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
        licenseRaw: "CC0",
        author: "Quaternius",
        sourceFamily: "Quaternius",
        retrievedAt: "2026-06-18T00:00:00.000Z"
      },
      skeleton: {
        skinCount: 1,
        jointCount: 7
      },
      morphTargets: {
        targetNames: ["Smile", "AA"]
      },
      hierarchy: {
        nodeCount: 7,
        meshCount: 1,
        materialCount: 1,
        textureCount: 1,
        animationClipCount: 1,
        skinCount: 1,
        morphTargetCount: 2,
        maxDepth: 1
      },
      quality: "release",
      role: "character",
      suitabilityReason: "Readable rigged character with named material, texture, bounds, orientation, and durable provenance.",
      renderedProbe: {
        url: "/aura-assets/fighter.probe.png",
        kind: "browser-screenshot",
        renderer: "createAuraApp"
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
    expect(typedAssets).toContain('"hierarchy"');
    expect(typedAssets).toContain('"quality": "release"');
    expect(typedAssets).toContain('"role": "character"');
    expect(typedAssets).toContain('"suitabilityReason"');
    expect(typedAssets).toContain('"renderedProbe"');
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

  test("source validation rejects raw model ids, raw GLB URLs, unsafe loaders, and three imports", () => {
    const projectDir = createProject();
    mkdirSync(join(projectDir, "src"), { recursive: true });
    writeFileSync(join(projectDir, "assets", "fighter.gltf"), JSON.stringify(createAnimatedCharacterGltf()));
    addAsset({
      projectDir,
      file: "assets/fighter.gltf",
      name: "fighter",
      license: "CC0-1.0",
      sourceUrl: "https://example.test/fighter",
      sourceFamily: "test-fixture"
    });
    writeFileSync(join(projectDir, "src", "main.ts"), `
      import * as THREE from "three";
      import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
      import { model } from "@aura3d/engine";
      model("fighter");
      const badUrl = "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/DamagedHelmet/glTF-Binary/DamagedHelmet.glb";
      const localUrl = "/models/scene.gltf";
      const escape = unsafeModelUrl(badUrl);
      void THREE;
      void GLTFLoader;
      void localUrl;
      void escape;
    `);

    const report = validateAssets({ projectDir, source: true });

    expect(report.ok).toBe(false);
    expect(report.source?.files).toEqual(["src/main.ts"]);
    expect(report.failures.join("\n")).toContain('raw model string id "fighter"');
    expect(report.failures.join("\n")).toContain("raw GLB/glTF URL or path");
    expect(report.failures.join("\n")).toContain("unsafeModelUrl is not allowed");
    expect(report.failures.join("\n")).toContain("GLTFLoader is not allowed");
    expect(report.failures.join("\n")).toContain("direct three imports are not allowed");
  });

  test("source validation reports typed asset usage by file", () => {
    const projectDir = createProject();
    mkdirSync(join(projectDir, "src"), { recursive: true });
    writeFileSync(join(projectDir, "assets", "fighter.gltf"), JSON.stringify(createAnimatedCharacterGltf()));
    writeFileSync(join(projectDir, "assets", "world.gltf"), JSON.stringify(createAnimatedCharacterGltf()));
    addAsset({
      projectDir,
      file: "assets/fighter.gltf",
      name: "fighter",
      license: "CC0-1.0",
      sourceUrl: "https://example.test/fighter",
      sourceFamily: "test-fixture"
    });
    addAsset({
      projectDir,
      file: "assets/world.gltf",
      name: "world",
      license: "CC0-1.0",
      sourceUrl: "https://example.test/world",
      sourceFamily: "test-fixture"
    });
    writeFileSync(join(projectDir, "src", "main.ts"), `
      import { model } from "@aura3d/engine";
      import { assets } from "./aura-assets";
      model(assets.fighter);
      model(assets["world"]);
      model(assets.fighter);
    `);

    const report = validateAssets({ projectDir, source: true });

    expect(report.ok).toBe(true);
    expect(report.source?.filesByAsset).toEqual({
      fighter: ["src/main.ts"],
      world: ["src/main.ts"]
    });
    expect(report.source?.typedAssetUsages).toEqual([
      { assetId: "fighter", typedAsset: "assets.fighter", file: "src/main.ts", occurrences: 2 },
      { assetId: "world", typedAsset: 'assets["world"]', file: "src/main.ts", occurrences: 1 }
    ]);
  });

  test("AST source validation rejects raw model string calls", () => {
    const projectDir = createProject();
    addSourceFixtureAsset(projectDir, "releaseFighter");
    writeFileSync(join(projectDir, "src", "main.ts"), `
      import { model } from "@aura3d/engine";
      model("raw-id");
    `);

    const report = validateAssets({ projectDir, source: true });

    expect(report.ok).toBe(false);
    expect(report.failures.join("\n")).toContain('raw model string id "raw-id"');
  });

  test("AST source validation rejects raw model URLs", () => {
    const projectDir = createProject();
    addSourceFixtureAsset(projectDir, "releaseFighter");
    writeFileSync(join(projectDir, "src", "main.ts"), `
      import { model } from "@aura3d/engine";
      model("https://example.com/model.glb");
      const localModel = "./models/vehicle.gltf";
      void localModel;
    `);

    const report = validateAssets({ projectDir, source: true });

    expect(report.ok).toBe(false);
    expect(report.failures.join("\n")).toContain('raw model string id "https://example.com/model.glb"');
    expect(report.failures.join("\n")).toContain('raw GLB/glTF URL or path "https://example.com/model.glb"');
    expect(report.failures.join("\n")).toContain('raw GLB/glTF URL or path "./models/vehicle.gltf"');
  });

  test("AST source validation rejects unsafeModelUrl calls", () => {
    const projectDir = createProject();
    addSourceFixtureAsset(projectDir, "releaseFighter");
    writeFileSync(join(projectDir, "src", "main.ts"), `
      const escape = unsafeModelUrl("/models/unsafe.glb");
      void escape;
    `);

    const report = validateAssets({ projectDir, source: true });

    expect(report.ok).toBe(false);
    expect(report.failures.join("\n")).toContain("unsafeModelUrl is not allowed");
  });

  test("AST source validation rejects GLTFLoader imports", () => {
    const projectDir = createProject();
    addSourceFixtureAsset(projectDir, "releaseFighter");
    writeFileSync(join(projectDir, "src", "main.ts"), `
      import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
      void GLTFLoader;
    `);

    const report = validateAssets({ projectDir, source: true });

    expect(report.ok).toBe(false);
    expect(report.failures.join("\n")).toContain("GLTFLoader is not allowed");
  });

  test("AST source validation rejects direct three imports", () => {
    const projectDir = createProject();
    addSourceFixtureAsset(projectDir, "releaseFighter");
    writeFileSync(join(projectDir, "src", "main.ts"), `
      import * as THREE from "three";
      void THREE;
    `);

    const report = validateAssets({ projectDir, source: true });

    expect(report.ok).toBe(false);
    expect(report.failures.join("\n")).toContain("direct three imports are not allowed");
  });

  test("AST source validation recognizes typed asset aliases", () => {
    const projectDir = createProject();
    addSourceFixtureAsset(projectDir, "releaseFighter");
    writeFileSync(join(projectDir, "src", "main.ts"), `
      import { model } from "@aura3d/engine";
      import { assets } from "./aura-assets";
      const hero = assets.releaseFighter;
      model(hero);
    `);

    const report = validateAssets({ projectDir, source: true });

    expect(report.ok).toBe(true);
    expect(report.source?.filesByAsset).toEqual({ releaseFighter: ["src/main.ts"] });
    expect(report.source?.typedAssetUsages).toEqual([
      { assetId: "releaseFighter", typedAsset: "assets.releaseFighter", file: "src/main.ts", occurrences: 1 }
    ]);
  });

  test("AST source validation recognizes destructured typed assets", () => {
    const projectDir = createProject();
    addSourceFixtureAsset(projectDir, "releaseFighter");
    writeFileSync(join(projectDir, "src", "main.ts"), `
      import { model } from "@aura3d/engine";
      import { assets } from "./aura-assets";
      const { releaseFighter } = assets;
      model(releaseFighter);
    `);

    const report = validateAssets({ projectDir, source: true });

    expect(report.ok).toBe(true);
    expect(report.source?.filesByAsset).toEqual({ releaseFighter: ["src/main.ts"] });
    expect(report.source?.typedAssetUsages).toEqual([
      { assetId: "releaseFighter", typedAsset: "assets.releaseFighter", file: "src/main.ts", occurrences: 1 }
    ]);
  });

  test("AST source validation recognizes wrapper-returned typed models", () => {
    const projectDir = createProject();
    addSourceFixtureAsset(projectDir, "releaseFighter");
    writeFileSync(join(projectDir, "src", "main.ts"), `
      import { model } from "@aura3d/engine";
      import { assets } from "./aura-assets";
      const makeHero = () => model(assets.releaseFighter);
      const hero = makeHero();
      void hero;
    `);

    const report = validateAssets({ projectDir, source: true });

    expect(report.ok).toBe(true);
    expect(report.source?.filesByAsset).toEqual({ releaseFighter: ["src/main.ts"] });
    expect(report.source?.typedAssetUsages).toEqual([
      { assetId: "releaseFighter", typedAsset: "assets.releaseFighter", file: "src/main.ts", occurrences: 1 }
    ]);
  });

  test("AST release source validation rejects primitive group player characters", () => {
    const projectDir = createProject();
    mkdirSync(join(projectDir, "src"), { recursive: true });
    addReleaseFixtureAsset(projectDir, {
      name: "releaseFighter",
      role: "character",
      suitabilityReason: "Release character candidate with humanoid height, forward-axis orientation, texture proof, and retained screenshot evidence for player readability."
    });
    writeFileSync(join(projectDir, "src", "main.ts"), `
      import { box, createAuraApp, group, model, scene, sphere } from "@aura3d/engine";
      import { assets } from "./aura-assets";
      const typedBackdrop = model(assets.releaseFighter);
      const playerCharacter = group().add(box()).add(sphere());
      createAuraApp("#app", { scene: scene().add(typedBackdrop).add(playerCharacter) });
    `);

    const report = validateAssets({ projectDir, source: true, release: true });

    expect(report.ok).toBe(false);
    expect(report.warnings.join("\n")).toContain('src/main.ts: primitive "playerCharacter" appears assigned to a primary-role object');
    expect(report.failures.join("\n")).toContain('Release validation warning is blocking: src/main.ts: primitive "playerCharacter" appears assigned to a primary-role object');
  });

  test("AST release source validation rejects primitive hero vehicles", () => {
    const projectDir = createProject();
    mkdirSync(join(projectDir, "src"), { recursive: true });
    addReleaseFixtureAsset(projectDir, {
      name: "releaseVehicle",
      role: "vehicle",
      suitabilityReason: "Release vehicle candidate with meter-scale footprint, forward-axis orientation, texture evidence, readable materials, and retained screenshot proof for racing track use.",
      foregroundBounds: { x: 90, y: 120, width: 360, height: 120 },
      patch: {
        bounds: [4.3, 1.4, 2],
        boundsMetadata: { min: [-2.15, 0, -1], max: [2.15, 1.4, 1], size: [4.3, 1.4, 2], center: [0, 0.7, 0], maxDimension: 4.3, grounded: true }
      }
    });
    writeFileSync(join(projectDir, "src", "main.ts"), `
      import { box, createAuraApp, model, scene } from "@aura3d/engine";
      import { assets } from "./aura-assets";
      const typedCar = model(assets.releaseVehicle);
      const heroVehicle = box();
      createAuraApp("#app", { scene: scene().add(typedCar).add(heroVehicle) });
    `);

    const report = validateAssets({ projectDir, source: true, release: true });

    expect(report.ok).toBe(false);
    expect(report.warnings.join("\n")).toContain('src/main.ts: primitive "heroVehicle" appears assigned to a primary-role object');
  });

  test("AST release source validation rejects mixed typed assets plus primitive primary subjects", () => {
    const projectDir = createProject();
    mkdirSync(join(projectDir, "src"), { recursive: true });
    addReleaseFixtureAsset(projectDir, {
      name: "releaseFighter",
      role: "character",
      suitabilityReason: "Release character candidate with humanoid height, forward-axis orientation, texture proof, and retained screenshot evidence for player readability."
    });
    writeFileSync(join(projectDir, "src", "main.ts"), `
      import { box, createAuraApp, group, model, scene, sphere } from "@aura3d/engine";
      import { assets } from "./aura-assets";
      const typedBackdrop = model(assets.releaseFighter);
      const productHero = group().add(box()).add(sphere());
      createAuraApp("#app", { scene: scene().add(typedBackdrop).add(productHero) });
    `);

    const report = validateAssets({ projectDir, source: true, release: true });

    expect(report.ok).toBe(false);
    expect(report.warnings.join("\n")).toContain('src/main.ts: primitive "productHero" appears assigned to a primary-role object');
  });

  test("AST release source validation allows debug and support primitives", () => {
    const projectDir = createProject();
    mkdirSync(join(projectDir, "src"), { recursive: true });
    addReleaseFixtureAsset(projectDir, {
      name: "releaseFighter",
      role: "character",
      suitabilityReason: "Release character candidate with humanoid height, forward-axis orientation, texture proof, and retained screenshot evidence for player readability."
    });
    writeFileSync(join(projectDir, "src", "main.ts"), `
      import { box, createAuraApp, group, model, scene, sphere } from "@aura3d/engine";
      import { assets } from "./aura-assets";
      const hero = model(assets.releaseFighter);
      const checkpointMarker = group().add(box()).add(sphere());
      const collisionGuide = box();
      const debugHitbox = box();
      const hudAnchor = sphere();
      createAuraApp("#app", { scene: scene().add(hero).add(checkpointMarker).add(collisionGuide).add(debugHitbox).add(hudAnchor) });
    `);

    const report = validateAssets({ projectDir, source: true, release: true });

    expect(report.ok).toBe(true);
    expect(report.warnings).toEqual([]);
  });

  test("source validation rejects typed asset references missing from the manifest", () => {
    const projectDir = createProject();
    mkdirSync(join(projectDir, "src"), { recursive: true });
    writeFileSync(join(projectDir, "assets", "fighter.gltf"), JSON.stringify(createAnimatedCharacterGltf()));
    addAsset({
      projectDir,
      file: "assets/fighter.gltf",
      name: "fighter",
      license: "CC0-1.0",
      sourceUrl: "https://example.test/fighter",
      sourceFamily: "test-fixture"
    });
    writeFileSync(join(projectDir, "src", "main.ts"), `
      import { model } from "@aura3d/engine";
      import { assets } from "./aura-assets";
      model(assets.fighter);
      model(assets.missingHero);
    `);

    const report = validateAssets({ projectDir, source: true });

    expect(report.ok).toBe(false);
    expect(report.source?.typedAssetUsages).toEqual([
      { assetId: "fighter", typedAsset: "assets.fighter", file: "src/main.ts", occurrences: 1 },
      { assetId: "missingHero", typedAsset: "assets.missingHero", file: "src/main.ts", occurrences: 1 }
    ]);
    expect(report.failures.join("\n")).toContain("src/main.ts: typed asset assets.missingHero is not present in aura.assets.json");
  });

  test("release source validation blocks primitive primary roles even when typed assets are present", () => {
    const projectDir = createProject();
    mkdirSync(join(projectDir, "src"), { recursive: true });
    const sourceFile = join(projectDir, "assets", "fighter.gltf");
    writeFileSync(sourceFile, JSON.stringify(createAnimatedCharacterGltf()));
    const renderedProbe = writeRenderedProbe(projectDir, "release-fighter.probe.png", sourceFile, "primitive-role-fixture");
    addAsset({
      projectDir,
      file: "assets/fighter.gltf",
      name: "releaseFighter",
      license: "CC0-1.0",
      licenseName: "CC0 1.0 Universal",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      author: "Fixture Author",
      sourcePage: "https://example.test/release-fighter",
      downloadUrl: "https://example.test/release-fighter.glb",
      sourceUrl: "https://example.test/release-fighter",
      sourceFamily: "test-fixture",
      retrievedAt: "2026-06-18T00:00:00.000Z",
      quality: "release",
      role: "character",
      suitabilityReason: "Browser-rendered release asset used to prove source validation catches primitive stand-ins.",
      renderedProbe
    });
    writeFileSync(join(projectDir, "src", "main.ts"), `
      import { createAuraApp, model, primitives, scene } from "@aura3d/engine";
      import { assets } from "./aura-assets";
      const playerCharacter = primitives.box();
      const typedBackdrop = model(assets.releaseFighter);
      createAuraApp("#app", { scene: scene().add(typedBackdrop).add(playerCharacter) });
    `);

    const report = validateAssets({ projectDir, source: true, release: true });

    expect(report.ok).toBe(false);
    expect(report.warnings.join("\n")).toContain('src/main.ts: primitive "playerCharacter" appears assigned to a primary-role object');
    expect(report.failures.join("\n")).toContain('Release validation warning is blocking: src/main.ts: primitive "playerCharacter" appears assigned to a primary-role object');
  });

  test("release validation blocks source warnings, temp provenance, and duplicate hashes", () => {
    const projectDir = createProject();
    mkdirSync(join(projectDir, "src"), { recursive: true });
    writeFileSync(join(projectDir, "assets", "fighter.gltf"), JSON.stringify(createAnimatedCharacterGltf()));
    addAsset({
      projectDir,
      file: "assets/fighter.gltf",
      name: "playerOne",
      license: "CC0-1.0",
      sourceUrl: "https://example.test/player-one",
      sourceFamily: "test-fixture"
    });
    addAsset({
      projectDir,
      file: "assets/fighter.gltf",
      name: "playerTwo",
      license: "CC0-1.0",
      sourceUrl: "https://example.test/player-two",
      sourceFamily: "test-fixture"
    });
    const manifestPath = join(projectDir, "aura.assets.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      assets: {
        id: string;
        source: string;
        bounds?: [number, number, number];
        boundsMetadata?: { size: [number, number, number] };
        materials?: string[];
        textures?: string[];
        thumbnailUrl?: string;
        provenance?: {
          sourcePath: string;
          sourceUrl?: string;
          license?: string;
          sourceFamily?: string;
          checkedAt: string;
        };
      }[];
    };
    const firstAsset = manifest.assets.find((asset) => asset.id === "playerOne");
    expect(firstAsset).toBeDefined();
    firstAsset!.source = "../../../var/folders/test/T/aura3d-resolve-abc/player-one.glb";
    firstAsset!.bounds = [0.01, 0.01, 0.01];
    firstAsset!.boundsMetadata = { size: [0.01, 0.01, 0.01] };
    firstAsset!.materials = [];
    firstAsset!.textures = [];
    firstAsset!.thumbnailUrl = undefined;
    firstAsset!.provenance = {
      sourcePath: "/var/folders/test/T/aura3d-resolve-abc/player-one.glb",
      sourceUrl: "https://example.test/player-one",
      license: "CC0-1.0",
      sourceFamily: "test-fixture",
      checkedAt: "2026-06-18T00:00:00.000Z"
    };
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    writeFileSync(join(projectDir, "src", "main.ts"), `
      import { createAuraApp, primitives, scene } from "@aura3d/engine";
      const playerCharacter = primitives.box();
      createAuraApp("#app", { scene: scene().add(playerCharacter) });
    `);

    const report = validateAssets({ projectDir, source: true, release: true });

    expect(report.ok).toBe(false);
    expect(report.warnings.join("\n")).toContain("duplicate asset hash");
    expect(report.warnings.join("\n")).toContain("temp-path provenance is not durable");
    expect(report.warnings.join("\n")).toContain("durable provenance missing sourcePage");
    expect(report.warnings.join("\n")).toContain("durable provenance missing downloadUrl");
    expect(report.warnings.join("\n")).toContain("durable provenance missing licenseUrl");
    expect(report.warnings.join("\n")).toContain("durable provenance missing acquisition timestamp");
    expect(report.warnings.join("\n")).toContain("release primary model quality grade missing or ungraded");
    expect(report.warnings.join("\n")).toContain("release primary model missing intended role");
    expect(report.warnings.join("\n")).toContain("release primary model missing suitability reason");
    expect(report.warnings.join("\n")).toContain("release primary model is too small");
    expect(report.warnings.join("\n")).toContain("release primary model has no material metadata");
    expect(report.warnings.join("\n")).toContain("release primary model has no texture references");
    expect(report.warnings.join("\n")).toContain("release primary model missing renderedProbe evidence");
    expect(report.warnings.join("\n")).toContain("release primary model missing thumbnail/probe artifact");
    expect(report.warnings.join("\n")).toContain("primary-role scene appears primitive-only");
    expect(report.failures.join("\n")).toContain("Release validation warning is blocking: duplicate asset hash");
    expect(report.failures.join("\n")).toContain("Release validation warning is blocking: playerOne: temp-path provenance");
    expect(report.failures.join("\n")).toContain("Release validation warning is blocking: playerOne: durable provenance missing sourcePage");
    expect(report.failures.join("\n")).toContain("Release validation warning is blocking: playerOne: release primary model quality grade missing or ungraded");
    expect(report.failures.join("\n")).toContain("Release validation warning is blocking: playerOne: release primary model missing intended role");
    expect(report.failures.join("\n")).toContain("Release validation warning is blocking: playerOne: release primary model missing suitability reason");
    expect(report.failures.join("\n")).toContain("Release validation warning is blocking: playerOne: release primary model is too small");
    expect(report.failures.join("\n")).toContain("Release validation warning is blocking: playerOne: release primary model has no texture references");
    expect(report.failures.join("\n")).toContain("Release validation warning is blocking: playerOne: release primary model missing renderedProbe evidence");
    expect(report.failures.join("\n")).toContain("Release validation warning is blocking: playerOne: release primary model missing thumbnail/probe artifact");
    expect(report.failures.join("\n")).toContain("Release validation warning is blocking: src/main.ts: primary-role scene appears primitive-only");
  });

  test("release validation accepts fully graded typed assets with rendered probe evidence", () => {
    const projectDir = createProject();
    const sourceFile = join(projectDir, "assets", "fighter.gltf");
    writeFileSync(sourceFile, JSON.stringify(createAnimatedCharacterGltf()));
    const renderedProbe = writeRenderedProbe(projectDir, "release-fighter.probe.png", sourceFile, "release-fighter-fixture");

    addAsset({
      projectDir,
      file: "assets/fighter.gltf",
      name: "releaseFighter",
      license: "CC0-1.0",
      licenseName: "CC0 1.0 Universal",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      author: "Fixture Author",
      sourcePage: "https://example.test/release-fighter",
      downloadUrl: "https://example.test/release-fighter.glb",
      sourceUrl: "https://example.test/release-fighter",
      sourceFamily: "test-fixture",
      retrievedAt: "2026-06-18T00:00:00.000Z",
      quality: "release",
      role: "character",
      suitabilityReason: "Browser-rendered release candidate with named material, texture, bounds, orientation, and retained screenshot probe.",
      renderedProbe
    });

    const report = validateAssets({ projectDir, release: true });

    expect(report.ok).toBe(true);
    expect(report.warnings).toEqual([]);
    expect(report.messages).toEqual(["Asset manifest is release-valid."]);
  });

  test("role-aware release validation rejects vehicle assets missing orientation evidence", () => {
    const projectDir = createProject();
    addReleaseFixtureAsset(projectDir, {
      name: "vehicleMissingOrientation",
      role: "vehicle",
      suitabilityReason: "Release vehicle candidate with readable material and texture proof, track-scale footprint, racing stance, and retained screenshot evidence for vehicle identity.",
      foregroundBounds: { x: 90, y: 120, width: 360, height: 110 },
      patch: {
        bounds: [4.1, 1.5, 2],
        boundsMetadata: { min: [-2.05, 0, -1], max: [2.05, 1.5, 1], size: [4.1, 1.5, 2], center: [0, 0.75, 0], maxDimension: 4.1, grounded: true },
        orientation: { source: "unknown", messages: ["No orientation metadata detected."] }
      }
    });

    const report = validateAssets({ projectDir, release: true });

    expect(report.ok).toBe(false);
    expect(report.warnings.join("\n")).toContain("vehicleMissingOrientation: role-aware release vehicle validation requires orientation/forward-axis evidence");
  });

  test("release validation accepts hash-bound product view orientation override backed by rendered probe", () => {
    const projectDir = createProject();
    const sourceFile = join(projectDir, "assets", "product.gltf");
    writeFileSync(sourceFile, JSON.stringify(createProductGltf()));
    const renderedProbe = writeRenderedProbe(projectDir, "product-view.probe.png", sourceFile, "product-configurator-fixture", {
      x: 150,
      y: 70,
      width: 260,
      height: 210
    });

    addAsset({
      projectDir,
      file: "assets/product.gltf",
      name: "releaseProduct",
      license: "CC0-1.0",
      licenseName: "CC0 1.0 Universal",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      author: "Fixture Author",
      sourcePage: "https://example.test/release-product",
      downloadUrl: "https://example.test/release-product.glb",
      sourceUrl: "https://example.test/release-product",
      sourceFamily: "test-fixture",
      retrievedAt: "2026-06-18T00:00:00.000Z",
      quality: "release",
      role: "product",
      suitabilityReason: "Release product configurator asset with readable material, texture evidence, stable dimensions, and route-primary rendered screenshot proof.",
      renderedProbe
    });

    const blocked = validateAssets({ projectDir, release: true });
    expect(blocked.ok).toBe(false);
    expect(blocked.warnings.join("\n")).toContain("releaseProduct: orientation metadata missing; facing direction cannot be validated");

    updateManifestAsset(projectDir, "releaseProduct", {
      orientation: createProductViewOrientationOverride(renderedProbe)
    });

    const report = validateAssets({ projectDir, release: true });
    expect(report.ok).toBe(true);
    expect(report.warnings).toEqual([]);
  });

  test("release validation accepts valid orientation overrides when stored warnings are absent", () => {
    const projectDir = createProject();
    const sourceFile = join(projectDir, "assets", "product.gltf");
    writeFileSync(sourceFile, JSON.stringify(createProductGltf()));
    const renderedProbe = writeRenderedProbe(projectDir, "product-view-no-warnings.probe.png", sourceFile, "product-configurator-fixture", {
      x: 150,
      y: 70,
      width: 260,
      height: 210
    });

    addAsset({
      projectDir,
      file: "assets/product.gltf",
      name: "releaseProductNoWarnings",
      license: "CC0-1.0",
      licenseName: "CC0 1.0 Universal",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      author: "Fixture Author",
      sourcePage: "https://example.test/release-product-no-warnings",
      downloadUrl: "https://example.test/release-product-no-warnings.glb",
      sourceUrl: "https://example.test/release-product-no-warnings",
      sourceFamily: "test-fixture",
      retrievedAt: "2026-06-18T00:00:00.000Z",
      quality: "release",
      role: "product",
      suitabilityReason: "Release product configurator asset with readable material, texture evidence, stable dimensions, and route-primary rendered screenshot proof.",
      renderedProbe
    });
    updateManifestAsset(projectDir, "releaseProductNoWarnings", {
      orientation: createProductViewOrientationOverride(renderedProbe),
      warnings: undefined
    });

    const report = validateAssets({ projectDir, release: true });
    expect(report.ok).toBe(true);
    expect(report.warnings).toEqual([]);
  });

  test("release validation rejects stale manifest orientation overrides", () => {
    const projectDir = createProject();
    const sourceFile = join(projectDir, "assets", "product.gltf");
    writeFileSync(sourceFile, JSON.stringify(createProductGltf()));
    const renderedProbe = writeRenderedProbe(projectDir, "stale-product-view.probe.png", sourceFile, "stale-product-configurator-fixture", {
      x: 150,
      y: 70,
      width: 260,
      height: 210
    });

    addAsset({
      projectDir,
      file: "assets/product.gltf",
      name: "staleReleaseProduct",
      license: "CC0-1.0",
      licenseName: "CC0 1.0 Universal",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      author: "Fixture Author",
      sourcePage: "https://example.test/stale-release-product",
      downloadUrl: "https://example.test/stale-release-product.glb",
      sourceUrl: "https://example.test/stale-release-product",
      sourceFamily: "test-fixture",
      retrievedAt: "2026-06-18T00:00:00.000Z",
      quality: "release",
      role: "product",
      suitabilityReason: "Release product configurator asset with readable material, texture evidence, stable dimensions, and route-primary rendered screenshot proof.",
      renderedProbe
    });
    const orientationOverride = createProductViewOrientationOverride(renderedProbe);
    const orientationRenderedProbe = orientationOverride.renderedProbe as Record<string, unknown>;
    updateManifestAsset(projectDir, "staleReleaseProduct", {
      orientation: {
        ...orientationOverride,
        assetHash: `sha256-${"0".repeat(64)}`,
        renderedProbe: {
          ...orientationRenderedProbe,
          assetHash: `sha256-${"0".repeat(64)}`
        }
      }
    });

    const report = validateAssets({ projectDir, release: true });

    expect(report.ok).toBe(false);
    expect(report.warnings.join("\n")).toContain("staleReleaseProduct: manifest orientation override asset hash binding is stale");
    expect(report.warnings.join("\n")).toContain("staleReleaseProduct: manifest orientation override renderedProbe asset hash binding is stale");
    expect(report.warnings.join("\n")).toContain("staleReleaseProduct: orientation metadata missing; facing direction cannot be validated");
  });

  test("role-aware release validation rejects vehicle assets with tiny unreadable probe foreground", () => {
    const projectDir = createProject();
    addReleaseFixtureAsset(projectDir, {
      name: "vehicleTinyProbe",
      role: "vehicle",
      suitabilityReason: "Release vehicle candidate with track footprint, forward-axis orientation, texture proof, and retained screenshot evidence suitable for racing readability.",
      foregroundBounds: { x: 20, y: 20, width: 50, height: 24 },
      patch: {
        bounds: [4.4, 1.4, 2.1],
        boundsMetadata: { min: [-2.2, 0, -1.05], max: [2.2, 1.4, 1.05], size: [4.4, 1.4, 2.1], center: [0, 0.7, 0], maxDimension: 4.4, grounded: true }
      }
    });

    const report = validateAssets({ projectDir, release: true });

    expect(report.ok).toBe(false);
    expect(report.warnings.join("\n")).toContain("vehicleTinyProbe: role-aware release vehicle renderedProbe foreground is too small/readability-poor");
  });

  test("role-aware release validation rejects character assets with tiny unreadable probe foreground", () => {
    const projectDir = createProject();
    addReleaseFixtureAsset(projectDir, {
      name: "characterTinyProbe",
      role: "character",
      suitabilityReason: "Release character candidate with humanoid height, forward-axis orientation, texture proof, and retained screenshot evidence for player readability.",
      foregroundBounds: { x: 40, y: 40, width: 20, height: 48 }
    });

    const report = validateAssets({ projectDir, release: true });

    expect(report.ok).toBe(false);
    expect(report.warnings.join("\n")).toContain("characterTinyProbe: role-aware release character renderedProbe foreground is too small/readability-poor");
  });

  test("role-aware release validation rejects product assets without material or texture evidence", () => {
    const projectDir = createProject();
    addReleaseFixtureAsset(projectDir, {
      name: "productNoSurface",
      role: "product",
      suitabilityReason: "Release product viewer candidate with stable dimensions and retained screenshot evidence for commerce configurator readability.",
      foregroundBounds: { x: 180, y: 70, width: 220, height: 180 },
      patch: {
        materials: [],
        materialMetadata: [],
        textures: [],
        hierarchy: { nodeCount: 7, meshCount: 1, materialCount: 0, textureCount: 0, animationClipCount: 1, skinCount: 1, morphTargetCount: 2, rootNodeNames: ["Hips"], maxDepth: 1, messages: [] }
      }
    });

    const report = validateAssets({ projectDir, release: true });

    expect(report.ok).toBe(false);
    expect(report.warnings.join("\n")).toContain("productNoSurface: role-aware release product validation requires readable material evidence");
    expect(report.warnings.join("\n")).toContain("productNoSurface: role-aware release product validation requires texture evidence");
  });

  test("role-aware release validation rejects huge world and track assets without normalization evidence", () => {
    const projectDir = createProject();
    addReleaseFixtureAsset(projectDir, {
      name: "hugeTrackNoNormalization",
      role: "track",
      suitabilityReason: "Release track world candidate with a readable gameplay route, broad footprint, material proof, texture proof, and retained screenshot evidence.",
      foregroundBounds: { x: 90, y: 60, width: 460, height: 240 },
      patch: {
        bounds: [5000, 40, 4500],
        boundsMetadata: { min: [-2500, 0, -2250], max: [2500, 40, 2250], size: [5000, 40, 4500], center: [0, 20, 0], maxDimension: 5000, grounded: true }
      }
    });

    const report = validateAssets({ projectDir, release: true });

    expect(report.ok).toBe(false);
    expect(report.warnings.join("\n")).toContain("hugeTrackNoNormalization: role-aware release track validation found huge bounds without explicit normalization evidence");
  });

  test("release validation does not treat vague scale wording as normalization evidence", () => {
    const vagueReasons = [
      ["hugeWorldIntentionallyLarge", "Release world asset with intentionally large route footprint, material proof, texture proof, and retained screenshot evidence."],
      ["hugeWorldMeterScale", "Release world asset with meter-scale footprint, material proof, texture proof, and retained screenshot evidence."],
      ["hugeWorldNotScaled", "Release world asset with not scaled source bounds, material proof, texture proof, and retained screenshot evidence."],
      ["hugeWorldNotRouteNormalized", "Release world asset with not route-normalized placement, readable material and texture proof, and retained screenshot evidence for route traversal."],
      ["hugeWorldWithoutAssetNormalised", "Release world asset with without asset-normalised placement, readable material and texture proof, and retained screenshot evidence for route traversal."],
      ["hugeWorldMissingCameraNormalized", "Release world asset with missing camera-normalized placement, readable material and texture proof, and retained screenshot evidence for route traversal."]
    ] as const;

    for (const [name, suitabilityReason] of vagueReasons) {
      const projectDir = createProject();
      addReleaseFixtureAsset(projectDir, {
        name,
        role: "world",
        suitabilityReason,
        foregroundBounds: { x: 60, y: 40, width: 500, height: 260 },
        patch: {
          bounds: [381.236, 309.576, 324.48],
          boundsMetadata: { min: [-190.618, -154.788, -162.24], max: [190.618, 154.788, 162.24], size: [381.236, 309.576, 324.48], center: [0, 0, 0], maxDimension: 381.236, grounded: true }
        }
      });

      const report = validateAssets({ projectDir, release: true });

      expect(report.ok).toBe(false);
      expect(report.warnings.join("\n")).toContain(`${name}: release primary model has excessive scale mismatch`);
    }
  });

  test("release validation accepts large world bounds with explicit normalization evidence", () => {
    const projectDir = createProject();
    addReleaseFixtureAsset(projectDir, {
      name: "normalizedWorld",
      role: "world",
      suitabilityReason: "Release world asset with gameplay-scale footprint, normalized camera-fit placement, readable material and texture proof, and retained screenshot evidence for route traversal.",
      foregroundBounds: { x: 60, y: 40, width: 500, height: 260 },
      patch: {
        bounds: [381.236, 309.576, 324.48],
        boundsMetadata: { min: [-190.618, -154.788, -162.24], max: [190.618, 154.788, 162.24], size: [381.236, 309.576, 324.48], center: [0, 0, 0], maxDimension: 381.236, grounded: true }
      }
    });

    const report = validateAssets({ projectDir, release: true });

    expect(report.ok).toBe(true);
    expect(report.warnings).toEqual([]);
  });

  test("role-aware release validation rejects abstract or debug assets used as primary release subjects", () => {
    const projectDir = createProject();
    addReleaseFixtureAsset(projectDir, {
      name: "abstractPrimary",
      role: "abstract",
      suitabilityReason: "Primary route asset for hero subject with retained screenshot proof and release metadata.",
      foregroundBounds: { x: 160, y: 70, width: 260, height: 200 }
    });

    const report = validateAssets({ projectDir, release: true });

    expect(report.ok).toBe(false);
    expect(report.warnings.join("\n")).toContain("abstractPrimary: release abstract assets cannot satisfy primary asset gates without an explicit non-primary rationale");
  });

  test("role-aware release validation accepts complete vehicle metadata", () => {
    const projectDir = createProject();
    addReleaseFixtureAsset(projectDir, {
      name: "vehicleReleaseReady",
      role: "vehicle",
      suitabilityReason: "Release vehicle candidate with meter-scale footprint, forward-axis orientation, texture evidence, readable materials, and retained screenshot proof for racing track use.",
      foregroundBounds: { x: 90, y: 120, width: 360, height: 120 },
      patch: {
        bounds: [4.3, 1.4, 2],
        boundsMetadata: { min: [-2.15, 0, -1], max: [2.15, 1.4, 1], size: [4.3, 1.4, 2], center: [0, 0.7, 0], maxDimension: 4.3, grounded: true }
      }
    });

    const report = validateAssets({ projectDir, release: true });

    expect(report.ok).toBe(true);
    expect(report.warnings).toEqual([]);
  });

  test("reads rendered probe JSON metadata for release validation", () => {
    const projectDir = createProject();
    const sourceFile = join(projectDir, "assets", "fighter.gltf");
    writeFileSync(sourceFile, JSON.stringify(createAnimatedCharacterGltf()));
    const renderedProbe = writeRenderedProbe(projectDir, "release-json-fighter.probe.png", sourceFile, "release-json-fixture");
    writeFileSync(join(projectDir, "release-json-fighter.probe.json"), `${JSON.stringify({ renderedProbe }, null, 2)}\n`);
    writeFileSync(join(projectDir, "release-json-root-fighter.probe.json"), `${JSON.stringify(renderedProbe, null, 2)}\n`);

    const parsedProbe = readRenderedProbeMetadata({
      projectDir,
      file: "release-json-fighter.probe.json"
    });
    const parsedRootProbe = readRenderedProbeMetadata({
      projectDir,
      file: "release-json-root-fighter.probe.json"
    });

    expect(parsedProbe).toEqual(renderedProbe);
    expect(parsedRootProbe).toEqual(renderedProbe);
    addAsset({
      projectDir,
      file: "assets/fighter.gltf",
      name: "releaseJsonFighter",
      license: "CC0-1.0",
      licenseName: "CC0 1.0 Universal",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      author: "Fixture Author",
      sourcePage: "https://example.test/release-json-fighter",
      downloadUrl: "https://example.test/release-json-fighter.glb",
      sourceUrl: "https://example.test/release-json-fighter",
      sourceFamily: "test-fixture",
      retrievedAt: "2026-06-18T00:00:00.000Z",
      quality: "release",
      role: "character",
      suitabilityReason: "Browser-rendered release character candidate loaded from retained probe metadata with readable orientation evidence.",
      renderedProbe: parsedProbe
    });

    const report = validateAssets({ projectDir, release: true });

    expect(report.ok).toBe(true);
    expect(report.warnings).toEqual([]);
  });

  test("rendered probe JSON metadata rejects incomplete reports", () => {
    const projectDir = createProject();
    writeFileSync(join(projectDir, "bad-probe.json"), `${JSON.stringify({
      renderedProbe: {
        url: "/aura-assets/bad.png",
        kind: "manual-inspection",
        renderer: "manual",
        route: "bad-fixture",
        width: 640,
        height: 360,
        checkedAt: "not-a-date"
      }
    }, null, 2)}\n`);

    expect(() => readRenderedProbeMetadata({
      projectDir,
      file: "bad-probe.json"
    })).toThrow(/kind "manual-inspection".*missing image sha256.*missing assetHash.*checkedAt/s);
  });

  test("release validation rejects fake rendered probe artifacts", () => {
    const projectDir = createProject();
    const sourceFile = join(projectDir, "assets", "fighter.gltf");
    writeFileSync(sourceFile, JSON.stringify(createAnimatedCharacterGltf()));
    mkdirSync(join(projectDir, "public", "aura-assets"), { recursive: true });
    const fakeProbe = Buffer.alloc(512, 1);
    writeFileSync(join(projectDir, "public", "aura-assets", "fake-fighter.probe.png"), fakeProbe);

    addAsset({
      projectDir,
      file: "assets/fighter.gltf",
      name: "fakeProbeFighter",
      license: "CC0-1.0",
      licenseName: "CC0 1.0 Universal",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      author: "Fixture Author",
      sourcePage: "https://example.test/fake-probe-fighter",
      downloadUrl: "https://example.test/fake-probe-fighter.glb",
      sourceUrl: "https://example.test/fake-probe-fighter",
      sourceFamily: "test-fixture",
      retrievedAt: "2026-06-18T00:00:00.000Z",
      quality: "release",
      role: "character",
      suitabilityReason: "Release metadata is complete but the rendered proof artifact is intentionally fake.",
      renderedProbe: {
        url: "/aura-assets/fake-fighter.probe.png",
        kind: "browser-screenshot",
        renderer: "createAuraApp",
        route: "fake-probe-fixture",
        width: 640,
        height: 360,
        checkedAt: "2026-06-18T00:00:00.000Z",
        sha256: sha256(fakeProbe),
        assetHash: sha256(readFileSync(sourceFile)),
        nonBlankPixels: 230400,
        colorBuckets: 8
      }
    });

    const report = validateAssets({ projectDir, release: true });

    expect(report.ok).toBe(false);
    expect(report.warnings.join("\n")).toContain("fakeProbeFighter: release primary model renderedProbe artifact is not PNG screenshot proof");
    expect(report.failures.join("\n")).toContain("Release validation warning is blocking: fakeProbeFighter: release primary model renderedProbe artifact is not PNG screenshot proof");
  });

  test("release validation rejects stale rendered probe hashes and metrics", () => {
    const projectDir = createProject();
    const sourceFile = join(projectDir, "assets", "fighter.gltf");
    writeFileSync(sourceFile, JSON.stringify(createAnimatedCharacterGltf()));
    const renderedProbe = writeRenderedProbe(projectDir, "stale-fighter.probe.png", sourceFile, "stale-probe-fixture");

    addAsset({
      projectDir,
      file: "assets/fighter.gltf",
      name: "staleProbeFighter",
      license: "CC0-1.0",
      licenseName: "CC0 1.0 Universal",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      author: "Fixture Author",
      sourcePage: "https://example.test/stale-probe-fighter",
      downloadUrl: "https://example.test/stale-probe-fighter.glb",
      sourceUrl: "https://example.test/stale-probe-fighter",
      sourceFamily: "test-fixture",
      retrievedAt: "2026-06-18T00:00:00.000Z",
      quality: "release",
      role: "character",
      suitabilityReason: "Release metadata is complete but the retained rendered proof metadata has been intentionally made stale.",
      renderedProbe: {
        ...renderedProbe,
        width: renderedProbe.width + 1,
        height: renderedProbe.height + 1,
        sha256: `sha256-${"0".repeat(64)}`,
        assetHash: `sha256-${"1".repeat(64)}`,
        nonBlankPixels: renderedProbe.nonBlankPixels - 1,
        colorBuckets: renderedProbe.colorBuckets + 1,
        foregroundBounds: {
          ...renderedProbe.foregroundBounds,
          x: renderedProbe.width,
          width: 50
        }
      }
    });

    const report = validateAssets({ projectDir, release: true });
    const warnings = report.warnings.join("\n");

    expect(report.ok).toBe(false);
    expect(warnings).toContain("staleProbeFighter: release primary model renderedProbe image sha256 mismatch");
    expect(warnings).toContain("staleProbeFighter: release primary model renderedProbe asset hash binding is stale");
    expect(warnings).toContain("staleProbeFighter: release primary model renderedProbe declared width");
    expect(warnings).toContain("staleProbeFighter: release primary model renderedProbe declared height");
    expect(warnings).toContain("staleProbeFighter: release primary model renderedProbe nonblank pixel count is stale");
    expect(warnings).toContain("staleProbeFighter: release primary model renderedProbe color bucket count is stale");
    expect(warnings).toContain("staleProbeFighter: release primary model renderedProbe foregroundBounds exceed PNG dimensions");
  });

  test("release validation rejects corrupt rendered probe PNG artifacts", () => {
    const projectDir = createProject();
    const sourceFile = join(projectDir, "assets", "fighter.gltf");
    writeFileSync(sourceFile, JSON.stringify(createAnimatedCharacterGltf()));
    const validProbe = createRenderedProbePng(640, 360);
    const corruptProbe = validProbe.buffer.subarray(0, Math.floor(validProbe.buffer.byteLength / 2));
    mkdirSync(join(projectDir, "public", "aura-assets"), { recursive: true });
    writeFileSync(join(projectDir, "public", "aura-assets", "corrupt-fighter.probe.png"), corruptProbe);

    addAsset({
      projectDir,
      file: "assets/fighter.gltf",
      name: "corruptProbeFighter",
      license: "CC0-1.0",
      licenseName: "CC0 1.0 Universal",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      author: "Fixture Author",
      sourcePage: "https://example.test/corrupt-probe-fighter",
      downloadUrl: "https://example.test/corrupt-probe-fighter.glb",
      sourceUrl: "https://example.test/corrupt-probe-fighter",
      sourceFamily: "test-fixture",
      retrievedAt: "2026-06-18T00:00:00.000Z",
      quality: "release",
      role: "character",
      suitabilityReason: "Release metadata is complete but the retained rendered proof PNG is intentionally corrupt.",
      renderedProbe: {
        url: "/aura-assets/corrupt-fighter.probe.png",
        kind: "browser-screenshot",
        renderer: "createAuraApp",
        route: "corrupt-probe-fixture",
        width: validProbe.width,
        height: validProbe.height,
        checkedAt: "2026-06-18T00:00:00.000Z",
        sha256: sha256(corruptProbe),
        assetHash: sha256(readFileSync(sourceFile)),
        nonBlankPixels: validProbe.nonBlankPixels,
        colorBuckets: validProbe.colorBuckets
      }
    });

    const report = validateAssets({ projectDir, release: true });

    expect(report.ok).toBe(false);
    expect(report.warnings.join("\n")).toContain("corruptProbeFighter: release primary model renderedProbe artifact is not PNG screenshot proof");
  });

  test("release validation rejects candidate-graded primary models even with probe evidence", () => {
    const projectDir = createProject();
    const sourceFile = join(projectDir, "assets", "fighter.gltf");
    writeFileSync(sourceFile, JSON.stringify(createAnimatedCharacterGltf()));
    const renderedProbe = writeRenderedProbe(projectDir, "candidate-fighter.probe.png", sourceFile, "candidate-fighter-fixture");

    addAsset({
      projectDir,
      file: "assets/fighter.gltf",
      name: "candidateFighter",
      license: "CC0-1.0",
      licenseName: "CC0 1.0 Universal",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      author: "Fixture Author",
      sourcePage: "https://example.test/candidate-fighter",
      downloadUrl: "https://example.test/candidate-fighter.glb",
      sourceUrl: "https://example.test/candidate-fighter",
      sourceFamily: "test-fixture",
      retrievedAt: "2026-06-18T00:00:00.000Z",
      quality: "candidate",
      role: "character",
      suitabilityReason: "Candidate asset has a retained screenshot probe but has not been approved as release quality.",
      renderedProbe
    });

    const report = validateAssets({ projectDir, release: true });

    expect(report.ok).toBe(false);
    expect(report.warnings.join("\n")).toContain('candidateFighter: release primary model quality grade "candidate" is not release-safe');
    expect(report.failures.join("\n")).toContain('Release validation warning is blocking: candidateFighter: release primary model quality grade "candidate" is not release-safe');
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

function writeRenderedProbe(
  projectDir: string,
  fileName: string,
  sourceFile: string,
  route: string,
  foregroundBounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } = { x: 140, y: 50, width: 360, height: 260 }
): {
  readonly url: string;
  readonly kind: "browser-screenshot";
  readonly renderer: string;
  readonly route: string;
  readonly width: number;
  readonly height: number;
  readonly checkedAt: string;
  readonly sha256: string;
  readonly assetHash: string;
  readonly nonBlankPixels: number;
  readonly colorBuckets: number;
  readonly foregroundBounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
} {
  const probe = createRenderedProbePng(640, 360);
  mkdirSync(join(projectDir, "public", "aura-assets"), { recursive: true });
  writeFileSync(join(projectDir, "public", "aura-assets", fileName), probe.buffer);
  return {
    url: `/aura-assets/${fileName}`,
    kind: "browser-screenshot",
    renderer: "createAuraApp",
    route,
    width: probe.width,
    height: probe.height,
    checkedAt: "2026-06-18T00:00:00.000Z",
    sha256: sha256(probe.buffer),
    assetHash: sha256(readFileSync(sourceFile)),
    nonBlankPixels: probe.nonBlankPixels,
    colorBuckets: probe.colorBuckets,
    foregroundBounds
  };
}

function createProductViewOrientationOverride(renderedProbe: {
  readonly url: string;
  readonly route: string;
  readonly checkedAt: string;
  readonly sha256: string;
  readonly assetHash: string;
}): Record<string, unknown> {
  return {
    source: "manifest-override",
    view: "route-primary-product-view",
    assetHash: renderedProbe.assetHash,
    generatedBy: "tests/unit/aura3d-cli/assets.test.ts route-primary rendered probe",
    checkedAt: renderedProbe.checkedAt,
    route: renderedProbe.route,
    renderedProbe: {
      url: renderedProbe.url,
      sha256: renderedProbe.sha256,
      assetHash: renderedProbe.assetHash,
      checkedAt: renderedProbe.checkedAt,
      route: renderedProbe.route
    },
    messages: ["Product view orientation approved from retained route-primary rendered probe evidence."]
  };
}

function updateManifestAsset(projectDir: string, id: string, patch: Record<string, unknown>): void {
  const manifestPath = join(projectDir, "aura.assets.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { assets: Record<string, unknown>[] };
  const asset = manifest.assets.find((entry) => entry.id === id);
  if (!asset) throw new Error(`Missing test asset ${id}`);
  Object.assign(asset, patch);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function addReleaseFixtureAsset(
  projectDir: string,
  options: {
    readonly name: string;
    readonly role: "character" | "vehicle" | "track" | "world" | "environment" | "product" | "abstract";
    readonly suitabilityReason: string;
    readonly foregroundBounds?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
    readonly patch?: Record<string, unknown>;
  }
): void {
  const sourceFile = join(projectDir, "assets", `${options.name}.gltf`);
  writeFileSync(sourceFile, JSON.stringify(createAnimatedCharacterGltf()));
  const renderedProbe = writeRenderedProbe(projectDir, `${options.name}.probe.png`, sourceFile, `${options.name}-role-fixture`, options.foregroundBounds);
  addAsset({
    projectDir,
    file: `assets/${options.name}.gltf`,
    name: options.name,
    license: "CC0-1.0",
    licenseName: "CC0 1.0 Universal",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    author: "Fixture Author",
    sourcePage: `https://example.test/${options.name}`,
    downloadUrl: `https://example.test/${options.name}.glb`,
    sourceUrl: `https://example.test/${options.name}`,
    sourceFamily: "test-fixture",
    retrievedAt: "2026-06-18T00:00:00.000Z",
    quality: "release",
    role: options.role,
    suitabilityReason: options.suitabilityReason,
    renderedProbe
  });
  if (options.patch) updateManifestAsset(projectDir, options.name, options.patch);
}

function addSourceFixtureAsset(projectDir: string, name: string): void {
  mkdirSync(join(projectDir, "src"), { recursive: true });
  writeFileSync(join(projectDir, "assets", `${name}.gltf`), JSON.stringify(createAnimatedCharacterGltf()));
  addAsset({
    projectDir,
    file: `assets/${name}.gltf`,
    name,
    license: "CC0-1.0",
    sourceUrl: `https://example.test/${name}`,
    sourceFamily: "test-fixture"
  });
}

function createRenderedProbePng(width: number, height: number): {
  readonly buffer: Buffer;
  readonly width: number;
  readonly height: number;
  readonly nonBlankPixels: number;
  readonly colorBuckets: number;
} {
  const rgba: number[] = [];
  const buckets = new Set<string>();
  let nonBlankPixels = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const red = 32 + ((x * 3 + y) % 180);
      const green = 48 + ((x + y * 2) % 160);
      const blue = 64 + ((x * 2 + y * 5) % 150);
      rgba.push(red, green, blue, 255);
      nonBlankPixels += 1;
      buckets.add(`${red >> 5}:${green >> 5}:${blue >> 5}`);
    }
  }
  return {
    buffer: encodeRgbaPng(width, height, rgba),
    width,
    height,
    nonBlankPixels,
    colorBuckets: buckets.size
  };
}

function sha256(buffer: Buffer): string {
  return `sha256-${createHash("sha256").update(buffer).digest("hex")}`;
}

function encodeRgbaPng(width: number, height: number, rgba: readonly number[]): Buffer {
  const scanlines: number[] = [];
  for (let y = 0; y < height; y += 1) {
    scanlines.push(0);
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      scanlines.push(rgba[offset] ?? 0, rgba[offset + 1] ?? 0, rgba[offset + 2] ?? 0, rgba[offset + 3] ?? 255);
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", Buffer.concat([
      uint32(width),
      uint32(height),
      Buffer.from([8, 6, 0, 0, 0])
    ])),
    pngChunk("IDAT", deflateSync(Buffer.from(scanlines))),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type, "ascii");
  return Buffer.concat([
    uint32(data.byteLength),
    typeBytes,
    data,
    uint32(crc32(Buffer.concat([typeBytes, data])))
  ]);
}

function uint32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0, 0);
  return buffer;
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
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

function createProductGltf(): Record<string, unknown> {
  return {
    asset: {
      version: "2.0"
    },
    materials: [{ name: "product-shell" }],
    meshes: [{ name: "ProductShell", primitives: [{}] }],
    nodes: [{ name: "ProductDisplay", mesh: 0 }],
    images: [{ uri: "data:image/png;base64,AA==" }],
    accessors: [{ min: [-0.8, 0, -0.4], max: [0.8, 0.9, 0.4] }]
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
