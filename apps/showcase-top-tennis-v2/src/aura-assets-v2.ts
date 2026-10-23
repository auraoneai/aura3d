// Aura Slam 3D v2 — Meshy-generated stadium & championship assets with verified sha256 hashes.
import { defineAuraAssets } from "@aura3d/engine";

export const v2assets = {
  tennisTrophy: {
    type: "model" as const,
    format: "glb" as const,
    url: "/aura-assets/tennis-trophy.glb",
    hash: "sha256-a54ffc9fcfbc9ee8abaa9886c727d31cca8413cd403c9f22049ecc23cb0100f9",
    bounds: [0.45, 0.72, 0.45] as const,
    role: "setDressing" as const,
    metadata: {
      generator: "meshy",
      taskId: "01a1484b-f366-77d8-ae7e-1df09416730d",
      license: "Meshy Commercial Terms",
      author: "Aura3D Studio via Meshy",
      quality: "candidate"
    }
  },
  tennisUmpireChair: {
    type: "model" as const,
    format: "glb" as const,
    url: "/aura-assets/tennis-umpire-chair.glb",
    hash: "sha256-2f726c222d7aa63b988def8560870facc7a1af9d0c69e3282b8649005b98f72a",
    bounds: [1.2, 2.9, 1.3] as const,
    role: "setDressing" as const,
    metadata: {
      generator: "meshy",
      taskId: "01a1484b-fa6f-7053-a5ee-ca7d9e36b35a",
      license: "Meshy Commercial Terms",
      author: "Aura3D Studio via Meshy",
      quality: "candidate"
    }
  },
  tennisMascot: {
    type: "model" as const,
    format: "glb" as const,
    url: "/aura-assets/tennis-mascot.glb",
    hash: "sha256-7652e7a29bbc1d4ef6f04ccebfbee82666251946478f0b6a456f3c31ab88442e",
    bounds: [1.1, 1.4, 1.1] as const,
    role: "setDressing" as const,
    metadata: {
      generator: "meshy",
      taskId: "01a1484c-0a30-7753-bf0b-24688519304d",
      license: "Meshy Commercial Terms",
      author: "Aura3D Studio via Meshy",
      quality: "candidate"
    }
  },
  tennisBallCart: {
    type: "model" as const,
    format: "glb" as const,
    url: "/aura-assets/tennis-ball-cart.glb",
    hash: "sha256-396729fe7135852b33735fde61a7843a067123a77370b4465dbbe8b8b44c2b99",
    bounds: [0.65, 0.95, 0.65] as const,
    role: "setDressing" as const,
    metadata: {
      generator: "meshy",
      taskId: "01a1484c-3707-740e-bce1-c3aa8f72cc42",
      license: "Meshy Commercial Terms",
      author: "Aura3D Studio via Meshy",
      quality: "candidate"
    }
  },
  tennisChampionStatue: {
    type: "model" as const,
    format: "glb" as const,
    url: "/aura-assets/tennis-champion-statue.glb",
    hash: "sha256-5dbe9739c1ae557e6d0594ddf0c248d59ab61484df6a8bc01b77a9fcbf276ab7",
    bounds: [1.4, 2.8, 1.4] as const,
    role: "setDressing" as const,
    metadata: {
      generator: "meshy",
      taskId: "01a1484c-3f6b-75d9-bd57-508f9c254be9",
      license: "Meshy Commercial Terms",
      author: "Aura3D Studio via Meshy",
      quality: "candidate"
    }
  },
  tennisAthlete: {
    type: "model" as const,
    format: "glb" as const,
    url: "/aura-assets/tennis-athlete.glb",
    hash: "sha256-d9c28b25fcb8b22f60a7d96e0ddadc700ad89d932f9e1ba515c4e09d234cd3c1",
    bounds: [0.95, 1.82, 0.65] as const,
    role: "hero" as const,
    metadata: {
      generator: "meshy",
      taskId: "01a1484e-d95d-71a4-b1c8-a05be40c1646",
      license: "Meshy Commercial Terms",
      author: "Aura3D Studio via Meshy",
      quality: "candidate"
    }
  }
} as const;

export const v2AssetManifest = defineAuraAssets(v2assets);
export type V2AssetKey = keyof typeof v2assets;
