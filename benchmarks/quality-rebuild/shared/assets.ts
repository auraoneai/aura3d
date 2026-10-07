/**
 * Asset table for the quality-rebuild benchmark.
 *
 * Every entry points at a git-tracked file that already exists in this
 * repository (no downloads, no invented URLs). The Vite config copies each
 * `repoPath` into `dist/qr-assets/<file>` at build time and serves it from the
 * same URL in dev, so both engines fetch byte-identical files from the same URL.
 *
 * Several of these files are Git LFS objects (`fixtures/asset-corpus/*.glb`,
 * `public/aura-assets/*.glb`); CI must check out with `lfs: true`.
 *
 * `sha256` values were computed from the files on disk when this table was
 * authored. `worldBounds` were computed from the glTF node hierarchy (accessor
 * min/max transformed by node TRS, skinning ignored).
 */

export type ModelAssetId =
  | "damagedHelmet"
  | "antiqueCamera"
  | "clearCoatTest"
  | "compareTransmission"
  | "sheenTestGrid"
  | "soldier"
  | "cesiumMan"
  | "robotExpressive"
  | "fox"
  | "rockA"
  | "rockB"
  | "crate"
  | "carConcept"
  | "littlestTokyo";

export type HdriAssetId = "studioSmall08" | "autumnFieldPuresky" | "kloppenheim06Puresky";

export interface ModelAssetEntry {
  readonly id: ModelAssetId;
  readonly repoPath: string;
  readonly url: string;
  readonly sha256: string;
  readonly lfs: boolean;
  /** World-space size of the glTF default scene in its native units (x, y, z). */
  readonly worldSize: readonly [number, number, number];
  readonly animations: readonly string[];
  readonly gltfExtensions: readonly string[];
  /** Upstream identity of the file and why it stands in for the requested asset, if it does. */
  readonly provenance: string;
}

export interface HdriAssetEntry {
  readonly id: HdriAssetId;
  readonly repoPath: string;
  readonly url: string;
  readonly sha256: string;
  readonly provenance: string;
}

const base = "/qr-assets/";

export const modelAssets: Readonly<Record<ModelAssetId, ModelAssetEntry>> = {
  damagedHelmet: {
    id: "damagedHelmet",
    repoPath: "fixtures/asset-corpus/damaged-helmet.glb",
    url: `${base}damaged-helmet.glb`,
    sha256: "sha256-4028ccbce11eb924936dad9bfee2af2aecf4b72203feb8a6b9dfdc458093e656",
    lfs: true,
    worldSize: [1.89, 1.802, 2.0],
    animations: [],
    gltfExtensions: [],
    provenance: "Khronos glTF-Sample-Assets DamagedHelmet (CC BY 4.0)"
  },
  antiqueCamera: {
    id: "antiqueCamera",
    repoPath: "fixtures/asset-corpus/antique-camera.glb",
    url: `${base}antique-camera.glb`,
    sha256: "sha256-7480f9bed3918fe63ce1da0e54dcd235bd11fe54c5006fa0f7a0a31ddcc274c1",
    lfs: true,
    worldSize: [2.597, 7.209, 3.395],
    animations: [],
    gltfExtensions: [],
    provenance: "Khronos glTF-Sample-Assets AntiqueCamera (CC0). Substitute for ToyCar, which is not in the repository."
  },
  clearCoatTest: {
    id: "clearCoatTest",
    repoPath: "fixtures/asset-corpus/clear-coat-test.glb",
    url: `${base}clear-coat-test.glb`,
    sha256: "sha256-c3a1cbe318cd043b937130af4eb83ec2ea0b03613387b1b7d769dfab4ac15948",
    lfs: true,
    worldSize: [10.458, 13.105, 1.11],
    animations: [],
    gltfExtensions: ["KHR_materials_clearcoat"],
    provenance: "Khronos glTF-Sample-Assets ClearCoatTest (CC BY 4.0)"
  },
  compareTransmission: {
    id: "compareTransmission",
    repoPath: "fixtures/threejs-parity/assets/materials/compare-transmission.glb",
    url: `${base}compare-transmission.glb`,
    sha256: "sha256-012a3ace61050f4aef77b416c56b3f8f313e1fa68c9040ce3d5037f67eea484f",
    lfs: false,
    worldSize: [3.0, 1.503, 1.315],
    animations: [],
    gltfExtensions: ["KHR_materials_transmission"],
    provenance: "Khronos glTF-Sample-Assets CompareTransmission. Substitute for TransmissionTest, which is not in the repository."
  },
  sheenTestGrid: {
    id: "sheenTestGrid",
    repoPath: "fixtures/asset-corpus/sheen-test-grid.glb",
    url: `${base}sheen-test-grid.glb`,
    sha256: "sha256-b3d82dde0ae6b93bef1a8085ec05540b21139f9917bfe771135c5aed9ba1c101",
    lfs: true,
    worldSize: [0.904, 0.652, 0.112],
    animations: [],
    gltfExtensions: ["KHR_materials_sheen"],
    provenance: "Khronos glTF-Sample-Assets SheenTestGrid. Substitute for SheenChair, which is not in the repository."
  },
  soldier: {
    id: "soldier",
    repoPath: "fixtures/threejs-parity/assets/character/soldier.glb",
    url: `${base}soldier.glb`,
    sha256: "sha256-dfb230fc1f942f259dd00281a1186953ad602fc5d69067ce63e24b2aa439736b",
    lfs: false,
    worldSize: [1.848, 1.832, 0.444],
    animations: ["Idle", "Run", "TPose", "Walk"],
    gltfExtensions: [],
    provenance: "three.js examples Soldier.glb (Mixamo). Byte-identical to the Aura3D bundled humanoid fixture."
  },
  cesiumMan: {
    id: "cesiumMan",
    repoPath: "fixtures/three-compat/assets/corpus/cesium-man.glb",
    url: `${base}cesium-man.glb`,
    sha256: "sha256-b7001eaeea8254bd44773bcd247e78696d94169388fbb2a1800fc69434e777d9",
    lfs: false,
    worldSize: [1.138, 1.507, 0.312],
    animations: ["(unnamed clip 0)"],
    gltfExtensions: [],
    provenance: "Khronos glTF-Sample-Assets CesiumMan (CC BY 4.0)"
  },
  robotExpressive: {
    id: "robotExpressive",
    repoPath: "fixtures/threejs-parity/assets/character/robot-expressive.glb",
    url: `${base}robot-expressive.glb`,
    sha256: "sha256-047f5e5fb3bb6d378bd1df16ca6137f2a596c99b3a1b5690b4020c05aaf6f319",
    lfs: false,
    worldSize: [6.619, 4.599, 3.122],
    animations: ["Dance", "Death", "Idle", "Jump", "No", "Punch", "Running", "Sitting", "Standing", "ThumbsUp", "Walking", "WalkJump", "Wave", "Yes"],
    gltfExtensions: [],
    provenance: "three.js examples RobotExpressive.glb (CC BY 3.0). PRD-06 T2.9 stand-in for an ARKit-52 morph head pending Q-05-2."
  },
  fox: {
    id: "fox",
    repoPath: "packages/create-aura3d/templates/animation-studio/public/hifi-cast/rpm/fox.glb",
    url: `${base}fox.glb`,
    sha256: "sha256-d97044e701822bac5a62696459b27d7b375aada5de8574ed4362edbba94771f7",
    lfs: false,
    worldSize: [25.185, 79.029, 154.72],
    animations: ["Survey", "Walk", "Run"],
    gltfExtensions: [],
    provenance: "Khronos glTF-Sample-Assets Fox (CC0 / CC BY 4.0 rig)"
  },
  rockA: {
    id: "rockA",
    repoPath: "public/aura-assets/propRockA.52dd1f0f.glb",
    url: `${base}propRockA.52dd1f0f.glb`,
    sha256: "sha256-52dd1f0f8d9fc9c65de6475522e43f8715eade7286fb5293aa6292fb959ae0e2",
    lfs: true,
    worldSize: [0.255, 0.148, 0.281],
    animations: [],
    gltfExtensions: [],
    provenance: "Aura3D typed catalog prop (public/aura-assets)"
  },
  rockB: {
    id: "rockB",
    repoPath: "public/aura-assets/propRockB.c94b2733.glb",
    url: `${base}propRockB.c94b2733.glb`,
    sha256: "sha256-c94b2733b7614369f6149b53113144e19262f074c40db86fcdcf3893761ca24d",
    lfs: true,
    worldSize: [2.678, 2.183, 3.961],
    animations: [],
    gltfExtensions: [],
    provenance: "Aura3D typed catalog prop (public/aura-assets)"
  },
  crate: {
    id: "crate",
    repoPath: "public/aura-assets/deepRecoveryCrateStandard.02520123.glb",
    url: `${base}deepRecoveryCrateStandard.02520123.glb`,
    sha256: "sha256-02520123a2fc5660f2ed99a05df2e3ec3e393d2ac4a59461956e3e716ea8057b",
    lfs: true,
    worldSize: [0.9, 1.0, 0.9],
    animations: [],
    gltfExtensions: [],
    provenance: "Aura3D typed catalog prop (public/aura-assets)"
  },
  carConcept: {
    id: "carConcept",
    repoPath: "fixtures/threejs-parity/assets/vehicles/car-concept.glb",
    url: `${base}car-concept.glb`,
    sha256: "sha256-1d1df2377481bd7f6b9d5a746a997747347009826b68ff74753181b737c5cd50",
    lfs: false,
    worldSize: [2.472, 4.559, 1.739],
    animations: [],
    gltfExtensions: ["KHR_materials_clearcoat", "KHR_materials_emissive_strength", "KHR_materials_iridescence", "KHR_materials_transmission", "KHR_materials_variants", "KHR_texture_transform"],
    provenance: "Khronos/glTF-Sample-SceneInfo car-concept concept car (ref-01 automotive-studio)"
  },
  littlestTokyo: {
    id: "littlestTokyo",
    repoPath: "fixtures/threejs-parity/assets/showcase/littlest-tokyo.glb",
    url: `${base}littlest-tokyo.glb`,
    sha256: "sha256-8375c2aa6808e28ad1cb9c0d43e1513f57ffd7865244bf66bbbd5bb0e907e06d",
    lfs: false,
    worldSize: [545.069, 552.042, 434.327],
    animations: ["Take 001"],
    gltfExtensions: ["KHR_draco_mesh_compression"],
    provenance: "three.js r185 webgl_animation_skinning_additive_blending LittlestTokyo (Draco; ref-02 diorama)"
  }
};

export const hdriAssets: Readonly<Record<HdriAssetId, HdriAssetEntry>> = {
  studioSmall08: {
    id: "studioSmall08",
    repoPath: "fixtures/environment-corpus/hdri/studio_small_08_1k.hdr",
    url: `${base}studio_small_08_1k.hdr`,
    sha256: "sha256-f6a989f89432eb4eee3191364a9c1ceed195c4ec3544173a3c04fd96cb91d0ba",
    provenance: "Poly Haven studio_small_08 1k (CC0)"
  },
  autumnFieldPuresky: {
    id: "autumnFieldPuresky",
    repoPath: "fixtures/environment-corpus/hdri/autumn_field_puresky_1k.hdr",
    url: `${base}autumn_field_puresky_1k.hdr`,
    sha256: "sha256-e60470d3a0f219585df1d74c393b472361c5400a7ff8d071ebe6eca29b7fe2b0",
    provenance: "Poly Haven autumn_field_puresky 1k (CC0)"
  },
  kloppenheim06Puresky: {
    id: "kloppenheim06Puresky",
    repoPath: "fixtures/environment-corpus/hdri/kloppenheim_06_puresky_1k.hdr",
    url: `${base}kloppenheim_06_puresky_1k.hdr`,
    sha256: "sha256-206c67e3a1b992282821cf06662bdd69bbb4915c1c4444a66338a40d6a7d4e34",
    provenance: "Poly Haven kloppenheim_06_puresky 1k (CC0)"
  }
};

/** Every file the build must copy, keyed by output file name. */
export function benchmarkAssetFiles(): readonly { readonly repoPath: string; readonly url: string }[] {
  return [
    ...Object.values(modelAssets).map(({ repoPath, url }) => ({ repoPath, url })),
    ...Object.values(hdriAssets).map(({ repoPath, url }) => ({ repoPath, url })),
    // DRACO decoder runtime for Draco-compressed GLBs (littlestTokyo); served at /qr-assets/draco/.
    { repoPath: "fixtures/asset-corpus/decoders/draco_decoder.js", url: `${base}draco/draco_decoder.js` },
    { repoPath: "fixtures/asset-corpus/decoders/draco_decoder_gltf.wasm", url: `${base}draco/draco_decoder.wasm` }
  ];
}
