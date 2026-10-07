/**
 * PRD-04 lane asset table (PRD-04 §14 P1-9/P1-10, CONTRACTS §4.1 lane 04 owns
 * `fixtures/asset-corpus/` and `scenes/prd04/`).
 *
 * Same shape as `shared/assets.ts`: `repoPath` is the git/LFS source of truth,
 * `url` is the canonical fetch path used once PRD 12 serves the asset corpus
 * (Q-04-3). Until then the lane harness and adapters fetch `/${repoPath}`,
 * which the example dev server and any static root serve byte-identically.
 *
 * sha256/worldSize were computed from the files on disk at author time.
 * Licenses come from each model's `metadata.json` in glTF-Sample-Assets.
 */

export type Prd04ModelAssetId =
  | "textureTransformTest"
  | "normalTangentTest"
  | "normalTangentMirrorTest"
  | "iridescenceLamp"
  | "anisotropyBarnLamp"
  | "anisotropyRotationTest"
  | "dispersionTest"
  | "materialsVariantsShoe"
  | "alphaBlendModeTest"
  | "compareTransmission"
  | "damagedHelmet"
  | "damagedHelmetUastc"
  | "damagedHelmetEtc1s"
  | "courierVanMeshyV2Decimated"
  | "patrolAircraftMeshy";

export type Prd04TextureAssetId = "metalPlates013";

const base = "/qr-assets/";

export interface Prd04AssetEntry {
  readonly id: string;
  readonly repoPath: string;
  readonly url: string;
  readonly sha256: string;
  readonly lfs: boolean;
  readonly worldSize?: readonly [number, number, number];
  readonly gltfExtensions?: readonly string[];
  readonly provenance: string;
}

export const prd04ModelAssets: Readonly<Record<Prd04ModelAssetId, Prd04AssetEntry>> = {
  textureTransformTest: {
    id: "textureTransformTest",
    repoPath: "fixtures/asset-corpus/texture-transform-test.glb",
    url: `${base}texture-transform-test.glb`,
    sha256: "sha256-e2f930d2ec20d5b89e7d5e93aae010c7d3cae117fb09ea57494b253fe4d2c3ae",
    lfs: true,
    worldSize: [3.2, 2.191, 0.01],
    gltfExtensions: ["KHR_texture_transform"],
    provenance:
      "Khronos glTF-Sample-Assets TextureTransformTest (CC0, Microsoft). Packed to GLB from the glTF/ directory variant (the model ships no glTF-Binary); PNG textures embedded."
  },
  normalTangentTest: {
    id: "normalTangentTest",
    repoPath: "fixtures/asset-corpus/normal-tangent-test.glb",
    url: `${base}normal-tangent-test.glb`,
    sha256: "sha256-5ac0932355ae1ea05a7485eeddcc3f1fbe56c678e00b519075feced80e9e9d6a",
    lfs: true,
    worldSize: [2.22, 2.15, 0.09],
    gltfExtensions: [],
    provenance: "Khronos glTF-Sample-Assets NormalTangentTest (CC0, Analytical Graphics Inc.)"
  },
  normalTangentMirrorTest: {
    id: "normalTangentMirrorTest",
    repoPath: "fixtures/asset-corpus/normal-tangent-mirror-test.glb",
    url: `${base}normal-tangent-mirror-test.glb`,
    sha256: "sha256-31ce5f3c873fc55531a17ccacf001e3d1d482a508695aa826fa79cc196e0ce78",
    lfs: true,
    worldSize: [2.839, 2.247, 0.091],
    gltfExtensions: [],
    provenance: "Khronos glTF-Sample-Assets NormalTangentMirrorTest (CC BY 4.0, Analytical Graphics Inc.)"
  },
  iridescenceLamp: {
    id: "iridescenceLamp",
    repoPath: "fixtures/asset-corpus/iridescence-lamp.glb",
    url: `${base}iridescence-lamp.glb`,
    sha256: "sha256-17cfdc79ec9e38fadb28db159734c5f9592ca423977b546e5057e350ba29ff13",
    lfs: true,
    worldSize: [0.297, 0.476, 0.302],
    gltfExtensions: ["KHR_materials_ior", "KHR_materials_iridescence", "KHR_materials_transmission", "KHR_materials_volume"],
    provenance: "Khronos glTF-Sample-Assets IridescenceLamp (CC BY 4.0, Wayfair LLC)"
  },
  anisotropyBarnLamp: {
    id: "anisotropyBarnLamp",
    repoPath: "fixtures/asset-corpus/anisotropy-barn-lamp.glb",
    url: `${base}anisotropy-barn-lamp.glb`,
    sha256: "sha256-0e728826c30bd6f3a18a0911db9f5f9ddc2dafa8e20bf9c3312c9625d1e32a24",
    lfs: true,
    worldSize: [0.191, 0.255, 0.227],
    gltfExtensions: [
      "KHR_materials_anisotropy",
      "KHR_materials_clearcoat",
      "KHR_materials_emissive_strength",
      "KHR_materials_transmission",
      "KHR_materials_volume"
    ],
    provenance: "Khronos glTF-Sample-Assets AnisotropyBarnLamp (CC BY 4.0, Wayfair LLC)"
  },
  anisotropyRotationTest: {
    id: "anisotropyRotationTest",
    repoPath: "fixtures/asset-corpus/anisotropy-rotation-test.glb",
    url: `${base}anisotropy-rotation-test.glb`,
    sha256: "sha256-8f6a45e69b1304cde2eb55edfd700cb3e73692be38d6f0ae146c41029a907e90",
    lfs: true,
    worldSize: [12.231, 6.008, 2.0],
    gltfExtensions: ["KHR_materials_anisotropy"],
    provenance: "Khronos glTF-Sample-Assets AnisotropyRotationTest (CC BY 4.0, Analytical Graphics Inc.)"
  },
  dispersionTest: {
    id: "dispersionTest",
    repoPath: "fixtures/asset-corpus/dispersion-test.glb",
    url: `${base}dispersion-test.glb`,
    sha256: "sha256-bbac38386632b5a7a27289737963314c2f92095074dfdf0e8c0c1c25270b3e37",
    lfs: true,
    worldSize: [0.217, 0.112, 0.189],
    gltfExtensions: ["KHR_materials_dispersion", "KHR_materials_ior", "KHR_materials_transmission", "KHR_materials_volume"],
    provenance: "Khronos glTF-Sample-Assets DispersionTest (CC BY 4.0, AGI)"
  },
  materialsVariantsShoe: {
    id: "materialsVariantsShoe",
    repoPath: "fixtures/asset-corpus/materials-variants-shoe.glb",
    url: `${base}materials-variants-shoe.glb`,
    sha256: "sha256-e1d7cb190382111e5a5b37b51e9a7f007f7eb2ab1b6185e0188e8d0a0d1265a7",
    lfs: true,
    worldSize: [0.298, 0.153, 0.116],
    gltfExtensions: ["KHR_materials_variants"],
    provenance: "Khronos glTF-Sample-Assets MaterialsVariantsShoe (CC BY 4.0, Shopify)"
  },
  alphaBlendModeTest: {
    id: "alphaBlendModeTest",
    repoPath: "fixtures/asset-corpus/alpha-blend-mode-test.glb",
    url: `${base}alpha-blend-mode-test.glb`,
    sha256: "sha256-37c3577d143071b42dd46e9d942b157837eb25c6340112171d7faecaa987b14e",
    lfs: true,
    worldSize: [8.6, 2.4, 1.3],
    gltfExtensions: [],
    provenance: "Khronos glTF-Sample-Assets AlphaBlendModeTest (CC BY 4.0, Analytical Graphics Inc.)"
  },
  compareTransmission: {
    id: "compareTransmission",
    repoPath: "fixtures/asset-corpus/compare-transmission.glb",
    url: `${base}compare-transmission.glb`,
    sha256: "sha256-012a3ace61050f4aef77b416c56b3f8f313e1fa68c9040ce3d5037f67eea484f",
    lfs: true,
    worldSize: [3.0, 1.503, 1.315],
    gltfExtensions: ["KHR_materials_transmission"],
    provenance:
      "Khronos glTF-Sample-Assets CompareTransmission (LicenseRef-LegalMark-Khronos). Byte-identical to fixtures/threejs-parity/assets/materials/compare-transmission.glb already in the shared table (sha256 match)."
  },
  damagedHelmet: {
    id: "damagedHelmet",
    repoPath: "fixtures/asset-corpus/damaged-helmet.glb",
    url: `${base}damaged-helmet.glb`,
    sha256: "sha256-4028ccbce11eb924936dad9bfee2af2aecf4b72203feb8a6b9dfdc458093e656",
    lfs: true,
    worldSize: [1.89, 1.802, 2.0],
    gltfExtensions: [],
    provenance: "Khronos glTF-Sample-Assets DamagedHelmet (CC BY 4.0). Same bytes as the shared table entry."
  },
  damagedHelmetUastc: {
    id: "damagedHelmetUastc",
    repoPath: "fixtures/asset-corpus/damaged-helmet-uastc.glb",
    url: `${base}damaged-helmet-uastc.glb`,
    sha256: "sha256-ee2925a04a3fa22d062eded69ea6edb08639042ec21819b06171239c10ab5725",
    lfs: true,
    worldSize: [1.89, 1.802, 2.0],
    gltfExtensions: ["KHR_texture_basisu"],
    provenance:
      "DamagedHelmet with every image re-encoded to KTX2/UASTC (Q-05-2 meanwhile path): `npx --package @gltf-transform/cli@4.5.1 gltf-transform uastc damaged-helmet.glb damaged-helmet-uastc.glb --level 2 --zstd 18`, toktx v4.4.0 (KTX-Software 4.4.0)."
  },
  damagedHelmetEtc1s: {
    id: "damagedHelmetEtc1s",
    repoPath: "fixtures/asset-corpus/damaged-helmet-etc1s.glb",
    url: `${base}damaged-helmet-etc1s.glb`,
    sha256: "sha256-8dedd96deb99d91490e677bd092d893290ac853044567682ba19b2ded04f2afe",
    lfs: true,
    worldSize: [1.89, 1.802, 2.0],
    gltfExtensions: ["KHR_texture_basisu"],
    provenance:
      "DamagedHelmet with every image re-encoded to KTX2/ETC1S: `npx --package @gltf-transform/cli@4.5.1 gltf-transform etc1s damaged-helmet.glb damaged-helmet-etc1s.glb --quality 128`, toktx v4.4.0 (KTX-Software 4.4.0). Informational variant."
  },
  courierVanMeshyV2Decimated: {
    id: "courierVanMeshyV2Decimated",
    repoPath: "public/aura-assets/courierVanMeshyV2Decimated.6f509ab0.glb",
    url: `${base}courierVanMeshyV2Decimated.6f509ab0.glb`,
    sha256: "sha256-6f509ab0902bbf048f828938332c4172b1dac0aef67f375e3fc666e88e0ba983",
    lfs: true,
    worldSize: [1.904, 0.941, 0.998],
    gltfExtensions: [],
    provenance: "Meshy-authored courier van, Aura3D typed catalog (public/aura-assets). S3 tinted-hero subject."
  },
  patrolAircraftMeshy: {
    id: "patrolAircraftMeshy",
    repoPath: "public/aura-assets/patrolAircraftMeshy.183e83f8.glb",
    url: `${base}patrolAircraftMeshy.183e83f8.glb`,
    sha256: "sha256-183e83f818cc35b68d0a5f0b1dcb2d11485abaf977c7cbefd4c3a538554d3428",
    lfs: true,
    worldSize: [1.535, 0.409, 1.902],
    gltfExtensions: [],
    provenance: "Meshy-authored patrol aircraft, Aura3D typed catalog (public/aura-assets). Hero-material subject."
  }
};

export interface Prd04TextureEntry {
  readonly id: Prd04TextureAssetId;
  readonly maps: {
    readonly color: { readonly repoPath: string; readonly url: string; readonly sha256: string };
    readonly normal: { readonly repoPath: string; readonly url: string; readonly sha256: string };
    readonly roughness: { readonly repoPath: string; readonly url: string; readonly sha256: string };
    readonly metalness: { readonly repoPath: string; readonly url: string; readonly sha256: string };
  };
  readonly provenance: string;
}

export const prd04TextureAssets: Readonly<Record<Prd04TextureAssetId, Prd04TextureEntry>> = {
  metalPlates013: {
    id: "metalPlates013",
    maps: {
      color: {
        repoPath: "fixtures/asset-corpus/textures/metal-plates-013-1k/color.png",
        url: `${base}metal-plates-013-color.png`,
        sha256: "sha256-6e115b4d823a1a27521441c23ce5c7aff84a58a8cdcaa81a8c74fd7d94ec4882"
      },
      normal: {
        repoPath: "fixtures/asset-corpus/textures/metal-plates-013-1k/normal.png",
        url: `${base}metal-plates-013-normal.png`,
        sha256: "sha256-d46e117cae73861e4236a2bc7d07c9bb1e4ddbfbecc5e44dab9246175295d4ae"
      },
      roughness: {
        repoPath: "fixtures/asset-corpus/textures/metal-plates-013-1k/roughness.png",
        url: `${base}metal-plates-013-roughness.png`,
        sha256: "sha256-e733bc516e2e3f83384bfb42bff995a98f6ea422524b2656ef5406ba2ecbbce5"
      },
      metalness: {
        repoPath: "fixtures/asset-corpus/textures/metal-plates-013-1k/metalness.png",
        url: `${base}metal-plates-013-metalness.png`,
        sha256: "sha256-7db812f2317eb9d9f7f99a332a9e30f179b94870cebf6940884195b269c4d220"
      }
    },
    provenance:
      "ambientCG MetalPlates013 1K PNG set (CC0, https://ambientcg.com/get?file=MetalPlates013_1K-PNG.zip). 1 m physical tile size per ambientCG convention."
  }
};

/** Every file the lane owns that a build/capture must ship. */
export function prd04AssetFiles(): readonly { repoPath: string; url: string }[] {
  const out: { repoPath: string; url: string }[] = [];
  for (const entry of Object.values(prd04ModelAssets)) out.push({ repoPath: entry.repoPath, url: entry.url });
  for (const entry of Object.values(prd04TextureAssets)) {
    for (const map of Object.values(entry.maps)) out.push({ repoPath: map.repoPath, url: map.url });
  }
  return out;
}
