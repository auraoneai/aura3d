import { defineAuraAssets } from "@aura3d/engine";
import type { AuraAssetDefinition, AuraAssetMap } from "@aura3d/engine";

/**
 * App-local typed asset manifest for Aura Slam 3D v2.
 *
 * These GLBs are Meshy generations owned by this route (rights metadata lives
 * beside each file in `public/aura-assets/<key>.rights.json` and full provenance
 * under `artifacts/meshy/tennis-*`). They deploy under `/aura-assets/` exactly
 * like the shared catalog, so URLs stay root-absolute.
 */
type AuraV2AssetDefinitions = {
  readonly "tennisTrophy": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "tennisUmpireChair": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "tennisMascot": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "tennisBallCart": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "tennisChampionStatue": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
  readonly "tennisAthlete": AuraAssetDefinition & { readonly type: "model"; readonly format: "glb"; readonly url: string; readonly hash: string; readonly bounds: readonly [number, number, number]; };
};

export const v2assets: AuraAssetMap<AuraV2AssetDefinitions> = defineAuraAssets({
  tennisTrophy: {
    type: "model",
    format: "glb",
    url: "/aura-assets/tennis-trophy.glb",
    hash: "sha256-meshy-preview",
    bounds: [1.671, 1.903, 1.173],
    sizeBytes: 1239500,
    metadata: {
      license: "meshy-generated for Aura Slam 3D v2",
      provenance: { generator: "meshy.ai", taskId: "01a1484b-f366-77d8-ae7e-1df09416730d", artifact: "artifacts/meshy/tennis-trophy" }
    }
  },
  tennisUmpireChair: {
    type: "model",
    format: "glb",
    url: "/aura-assets/tennis-umpire-chair.glb",
    hash: "sha256-meshy-preview",
    bounds: [0.482, 1.904, 0.626],
    sizeBytes: 1265996,
    metadata: {
      license: "meshy-generated for Aura Slam 3D v2",
      provenance: { generator: "meshy.ai", taskId: "01a1484b-fa6f-7053-a5ee-ca7d9e36b35a", artifact: "artifacts/meshy/tennis-umpire-chair" }
    }
  },
  tennisMascot: {
    type: "model",
    format: "glb",
    url: "/aura-assets/tennis-mascot.glb",
    hash: "sha256-meshy-preview",
    bounds: [1.902, 1.543, 1.315],
    sizeBytes: 1512092,
    metadata: {
      license: "meshy-generated for Aura Slam 3D v2",
      provenance: { generator: "meshy.ai", taskId: "01a1484c-0a30-7753-bf0b-24688519304d", artifact: "artifacts/meshy/tennis-mascot" }
    }
  },
  tennisBallCart: {
    type: "model",
    format: "glb",
    url: "/aura-assets/tennis-ball-cart.glb",
    hash: "sha256-meshy-preview",
    bounds: [1.78, 1.902, 0.967],
    sizeBytes: 1533084,
    metadata: {
      license: "meshy-generated for Aura Slam 3D v2",
      provenance: { generator: "meshy.ai", taskId: "01a1484c-3707-740e-bce1-c3aa8f72cc42", artifact: "artifacts/meshy/tennis-ball-cart" }
    }
  },
  tennisChampionStatue: {
    type: "model",
    format: "glb",
    url: "/aura-assets/tennis-champion-statue.glb",
    hash: "sha256-meshy-preview",
    bounds: [1.03, 1.806, 1.061],
    sizeBytes: 1371804,
    metadata: {
      license: "meshy-generated for Aura Slam 3D v2",
      provenance: { generator: "meshy.ai", taskId: "01a1484c-3f6b-75d9-bd57-508f9c254be9", artifact: "artifacts/meshy/tennis-champion-statue" }
    }
  },
  tennisAthlete: {
    type: "model",
    format: "glb",
    url: "/aura-assets/tennis-athlete.glb",
    hash: "sha256-meshy-preview",
    bounds: [0.739, 1.902, 0.475],
    sizeBytes: 1968588,
    metadata: {
      license: "meshy-generated for Aura Slam 3D v2",
      provenance: { generator: "meshy.ai", taskId: "01a1484c-524c-743b-9ae0-28313ea47218", artifact: "artifacts/meshy/tennis-athlete" }
    }
  }
} as const);

export type AuraV2Assets = typeof v2assets;
