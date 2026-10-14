import { defineAuraAssets } from "@aura3d/engine";

export const assets = defineAuraAssets({
  // Rigged mech (CC0/Quaternius, characters/robots-mechs). Balanced chassis.
  quaterniusMech: {
    type: "model",
    format: "glb",
    url: "/aura-assets/quaternius-mech.glb",
    bounds: [1.8, 2.6, 1.0],
    hash: "sha256-d61427def92c18148eaa9cebbc0dbd26b8e55ea5d048293840165077180bd181",
    metadata: {
      materials: [],
      animations: [
        "RobotArmature|Dance", "RobotArmature|Death", "RobotArmature|Hello", "RobotArmature|HitRecieve_1",
        "RobotArmature|HitRecieve_2", "RobotArmature|Idle", "RobotArmature|Jump", "RobotArmature|Jump_Landing",
        "RobotArmature|Jump_NoHeight", "RobotArmature|Kick", "RobotArmature|No", "RobotArmature|Pickup",
        "RobotArmature|Run", "RobotArmature|Shoot_Big", "RobotArmature|Shoot_Small", "RobotArmature|Walk",
        "RobotArmature|Yes"
      ],
      textures: [],
      libraryId: "quaternius-mech",
      libraryKit: "characters/robots-mechs",
      license: "CC0",
      attribution: "Quaternius",
      sourcePage: "https://poly.pizza/m/o3Ps8z8ByP"
    }
  },
  // Rigged robot (CC0/Quaternius). Light, fast chassis.
  quaterniusRobotEnemy: {
    type: "model",
    format: "glb",
    url: "/aura-assets/quaternius-robot-enemy.glb",
    bounds: [1.1, 1.2, 0.7],
    hash: "sha256-d5d1de1481560415c9006dd1989c2dd09ee1b59955c43bcd8d331445a5e69cb7",
    metadata: {
      materials: [],
      animations: [
        "CharacterArmature|Attack", "CharacterArmature|Death", "CharacterArmature|Idle",
        "CharacterArmature|Jump", "CharacterArmature|Run", "CharacterArmature|Shoot", "CharacterArmature|Walk"
      ],
      textures: [],
      libraryId: "quaternius-robot-enemy",
      libraryKit: "characters/robots-mechs",
      license: "CC0",
      attribution: "Quaternius",
      sourcePage: "https://poly.pizza/m/1gNo5ezvmr"
    }
  },
  // Rigged robot, large frame (CC0/Quaternius). Slow, hard-hitting chassis.
  quaterniusRobotEnemyLarge: {
    type: "model",
    format: "glb",
    url: "/aura-assets/quaternius-robot-enemy-large.glb",
    bounds: [1.3, 1.3, 0.8],
    hash: "sha256-1d21ee204a8080897623171baadcd3b4b10fd24c9c959eae2a94c0042a5462d7",
    metadata: {
      materials: [],
      animations: [
        "CharacterArmature|Attack", "CharacterArmature|Attack.001", "CharacterArmature|Death",
        "CharacterArmature|Idle", "CharacterArmature|Jump", "CharacterArmature|Run",
        "CharacterArmature|Shoot", "CharacterArmature|Walk"
      ],
      textures: [],
      libraryId: "quaternius-robot-enemy-large",
      libraryKit: "characters/robots-mechs",
      license: "CC0",
      attribution: "Quaternius",
      sourcePage: "https://poly.pizza/m/mPDR0L5uKx"
    }
  },
  // Rigged robot with gun (CC0/Quaternius). Mounted only as target dummies.
  quaterniusRobotEnemyLargeGun: {
    type: "model",
    format: "glb",
    url: "/aura-assets/quaternius-robot-enemy-large-gun.glb",
    bounds: [1.3, 1.3, 0.8],
    hash: "sha256-5c5f5b28c002592f590b23503c2cb98bf230293b165e56496d650bd6eeaafd9e",
    metadata: {
      materials: [],
      animations: [
        "CharacterArmature|Attack", "CharacterArmature|Attack.001", "CharacterArmature|Death",
        "CharacterArmature|Idle", "CharacterArmature|Jump", "CharacterArmature|Run",
        "CharacterArmature|Shoot", "CharacterArmature|Walk"
      ],
      textures: [],
      libraryId: "quaternius-robot-enemy-large-gun",
      libraryKit: "characters/robots-mechs",
      license: "CC0",
      attribution: "Quaternius",
      sourcePage: "https://poly.pizza/m/mWojM4i2IH"
    }
  },
  // Flying gun drone (CC0/Quaternius, vehicles). Optional support attachment.
  quaterniusFlyingGunDrone: {
    type: "model",
    format: "glb",
    url: "/aura-assets/quaternius-flying-gun-drone.glb",
    bounds: [1.6, 0.7, 0.9],
    hash: "sha256-af82b5b458530b31ce9694cf0461649839e1e822a922203faa16f4c32c21e595",
    metadata: {
      materials: [],
      animations: [
        "CharacterArmature|Attack", "CharacterArmature|Dead", "CharacterArmature|Idle",
        "CharacterArmature|Run", "CharacterArmature|Shoot", "CharacterArmature|Walk"
      ],
      textures: [],
      libraryId: "quaternius-flying-gun-drone",
      libraryKit: "vehicles/air-space-sea",
      license: "CC0",
      attribution: "Quaternius",
      sourcePage: "https://poly.pizza/m/UDTM6X1y9a"
    }
  },
  // Hangar set dressing: floor slabs, rails and crates from one crate GLB.
  quaterniusCubeCrate: {
    type: "model",
    format: "glb",
    url: "/aura-assets/quaternius-cube-crate.glb",
    bounds: [2.021, 2.021, 2.021],
    hash: "sha256-e0c4c5946b53ba314ec6e22bdb5d3329e4a2f0950b3c477a88e0d456d85baea8",
    metadata: {
      materials: [],
      animations: [],
      textures: [],
      libraryId: "quaternius-cube-crate",
      libraryKit: "props/industrial-urban",
      license: "CC0",
      attribution: "Quaternius",
      sourcePage: "https://poly.pizza/m/YAghI6GBls"
    }
  },
  // Hangar back wall panel.
  quaterniusWallModular: {
    type: "model",
    format: "glb",
    url: "/aura-assets/quaternius-wall-modular.glb",
    bounds: [2.001, 2.005, 0.438],
    hash: "sha256-052a5ff5a468c946dcfe170d907a0c4554a96c7f253c89ff54e72fdf048d22c6",
    metadata: {
      materials: [],
      animations: [],
      textures: [],
      libraryId: "quaternius-wall-modular",
      libraryKit: "environments/modular",
      license: "CC0",
      attribution: "Quaternius",
      sourcePage: "https://poly.pizza/m/itasw0GWNf"
    }
  }
} as const);
