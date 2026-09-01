import type { AuraVec3 } from "@aura3d/engine";

export type ProbeAssetId =
  | "bankShotTable" | "bankShotCue"
  | "bankShotBall00" | "bankShotBall01" | "bankShotBall02" | "bankShotBall03"
  | "bankShotBall04" | "bankShotBall05" | "bankShotBall06" | "bankShotBall07"
  | "bankShotBall08" | "bankShotBall09" | "bankShotBall10" | "bankShotBall11"
  | "bankShotBall12" | "bankShotBall13" | "bankShotBall14" | "bankShotBall15"
  | "rooftopCourt" | "rooftopBackboard" | "rooftopRim" | "rooftopBall" | "rooftopShooter" | "rooftopDefender" | "rooftopLayupScorer"
  | "vaultBreakersTable" | "vaultBreakersMechanisms" | "vaultBreakersBall" | "vaultBreakersFlipper" | "vaultBreakersVaultDoor"
  | "galleryShiftMuseumInterior" | "galleryShiftCutawayMuseumWorld" | "galleryShiftPedestal" | "galleryShiftExhibitA" | "galleryShiftExhibitB" | "galleryShiftExhibitC" | "galleryShiftDisplayCase"
  | "deepRecoverySub" | "deepRecoveryWreckHull" | "deepRecoveryCrateStandard" | "deepRecoveryCrateHeavy" | "deepRecoveryBuoyBeacon"
  | "patrolWingPlane" | "patrolWingDroneA" | "patrolWingDroneB" | "patrolWingPadBeacon"
  | "showcaseExpressiveRobot"
  | "mechChassisA" | "mechChassisB" | "mechChassisC" | "mechChassisD"
  | "mechArmsA" | "mechArmsB" | "mechArmsC" | "mechArmsD"
  | "mechLegsA" | "mechLegsB" | "mechLegsC" | "mechLegsD"
  | "mechWeaponA" | "mechWeaponB" | "mechWeaponC" | "mechWeaponD"
  | "neonCourierAvatar"
  | "neonBarricadeProp"
  | "neonStreetLampProp"
  | "neonRainGardenArenaBackdrop"
  | "neonRainCourierHero"
  | "neonCrownMothElite"
  | "auroraLanderProbe"
  | "auroraPadBeacon"
  | "auroraExtractionBayBackdrop"
  | "auroraExtractionLanderHero"
  | "gravityPostMailPod"
  | "gravityPostDockBeacon"
  | "gravityPostFreightDistrict"
  | "gravityPostCourierSkiff"
  | "pulseReactorEncounterWorld"
  | "pulseTerminalSentry"
  | "pulseRunnerCraft"
  | "courierVan"
  | "courierParcel"
  | "courierTrafficSedan"
  | "courierTrafficHatch"
  | "courierZoneAwning"
  | "courierZoneBollard"
  | "siegeGolfCourseWorld"
  | "siegeGolfBall"
  | "siegeWoodenCrate"
  | "siegeWoodenBarrel"
  | "siegePlankSet"
  | "turboRaceCar"
  | "propPineTree"
  | "propBoulder"
  | "propRockA"
  | "propRockB"
  | "propConifer"
  | "showcaseDetailedRaceCircuit"
  | "showcaseRaceGameEnvironment"
  | "showcaseIsometricRaceTrack"
  | "showcaseSouthGardaTrack"
  | "showcaseSmallCarRacingEnvironment"
  | "showcaseHighpolySportsCar"
  | "showcaseRaceCar"
  | "showcasePlatformerWorldLevel"
  | "showcaseFloatingIslandWorld"
  | "showcaseReadablePlatformLevel"
  | "showcaseRooftopParkourWorld"
  | "showcaseRunnerRobot"
  | "showcasePlatformRunnerHero"
  | "showcaseStylizedMaleRunner"
  | "showcaseArchitectureCityBlock"
  | "showcaseArcadeCabinet"
  | "showcaseArcadeController"
  | "showcaseBlockfallCabinet"
  | "blockfallReactorArenaBackdrop"
  | "blockfallReactorMechanicHero"
  | "blockfallReactorPlasmaRival"
  | "showcaseCityVehicle"
  | "showcaseOrangeIndustrialRobot"
  | "showcaseParticleCore"
  | "showcaseMiniRaceTrack"
  | "showcasePlatformHero"
  | "showcasePlatformerWorldLevel"
  | "showcaseRoboticWeldingWorkcell"
  | "showcaseSidekickRunner"
  | "showcaseSideScrollerWorld"
  | "showcaseSkylineCity"
  | "showcaseSideScrollerPlatformLevel"
  | "showcaseTexturedSportsCar"
  | "showcaseTsukubaCircuit"
  | "turboFormulaCircuit"
  | "showcaseVoxelBuilding"
  | "showcaseWalkAnimatedGirl"
  | "showcaseKenneyNeonRaceCircuit"
  | "showcaseKenneyRaceCarRed"
  | "showcaseCc0FormulaRaceCar"
  | "showcaseCcByFormulaOpponent"
  | "skylineWinterParallaxBackdrop"
  | "skylineArcticRunnerHero"
  | "skylineIceLedgeLong"
  | "skylineIceLedgeMedium"
  | "skylineIceLedgeCompact"
  | "showcaseKenneyVerdantPlatformerWorld"
  | "showcaseKenneyOobiPlatformerHero";

export interface ProbeConfig {
  readonly targetHeight?: number;
  readonly targetMaxDimension?: number;
  readonly cameraTargetHeight?: number;
  readonly cameraTargetMaxDimension?: number;
  readonly padding: number;
  readonly fov: number;
  readonly azimuth: number;
  readonly elevation: number;
  readonly rotation?: AuraVec3;
  readonly minForegroundWidth: number;
  readonly minForegroundHeight: number;
  readonly orientation?: {
    readonly forwardAxis: "+Z" | "-Z" | "+X" | "-X";
    readonly upAxis: "+Y" | "-Y" | "+Z" | "-Z";
    readonly message: string;
  };
}

export const PROBE_ASSETS = [
  "bankShotTable", "bankShotCue",
  "bankShotBall00", "bankShotBall01", "bankShotBall02", "bankShotBall03",
  "bankShotBall04", "bankShotBall05", "bankShotBall06", "bankShotBall07",
  "bankShotBall08", "bankShotBall09", "bankShotBall10", "bankShotBall11",
  "bankShotBall12", "bankShotBall13", "bankShotBall14", "bankShotBall15",
  "rooftopCourt", "rooftopBackboard", "rooftopRim", "rooftopBall", "rooftopShooter", "rooftopDefender", "rooftopLayupScorer",
  "vaultBreakersTable", "vaultBreakersMechanisms", "vaultBreakersBall", "vaultBreakersFlipper", "vaultBreakersVaultDoor",
  "galleryShiftMuseumInterior", "galleryShiftCutawayMuseumWorld", "galleryShiftPedestal", "galleryShiftExhibitA", "galleryShiftExhibitB", "galleryShiftExhibitC", "galleryShiftDisplayCase",
  "deepRecoverySub", "deepRecoveryWreckHull", "deepRecoveryCrateStandard", "deepRecoveryCrateHeavy", "deepRecoveryBuoyBeacon",
  "patrolWingPlane", "patrolWingDroneA", "patrolWingDroneB", "patrolWingPadBeacon",
  "showcaseExpressiveRobot",
  "mechChassisA", "mechChassisB", "mechChassisC", "mechChassisD",
  "mechArmsA", "mechArmsB", "mechArmsC", "mechArmsD",
  "mechLegsA", "mechLegsB", "mechLegsC", "mechLegsD",
  "mechWeaponA", "mechWeaponB", "mechWeaponC", "mechWeaponD",
  "neonCourierAvatar",
  "neonBarricadeProp",
  "neonStreetLampProp",
  "neonRainGardenArenaBackdrop",
  "neonRainCourierHero",
  "neonCrownMothElite",
  "auroraLanderProbe",
  "auroraPadBeacon",
  "auroraExtractionBayBackdrop",
  "auroraExtractionLanderHero",
  "gravityPostMailPod",
  "gravityPostDockBeacon",
  "gravityPostFreightDistrict",
  "gravityPostCourierSkiff",
  "pulseReactorEncounterWorld",
  "pulseTerminalSentry",
  "pulseRunnerCraft",
  "courierVan",
  "courierParcel",
  "courierTrafficSedan",
  "courierTrafficHatch",
  "courierZoneAwning",
  "courierZoneBollard",
  "siegeGolfCourseWorld",
  "siegeGolfBall",
  "siegeWoodenCrate",
  "siegeWoodenBarrel",
  "siegePlankSet",
  "showcaseArchitectureCityBlock",
  "showcaseArcadeCabinet",
  "showcaseArcadeController",
  "showcaseBlockfallCabinet",
  "blockfallReactorArenaBackdrop",
  "blockfallReactorMechanicHero",
  "blockfallReactorPlasmaRival",
  "showcaseTexturedSportsCar",
  "showcaseTsukubaCircuit",
  "turboFormulaCircuit",
  "showcaseWalkAnimatedGirl",
  "showcaseCityVehicle",
  "showcaseSideScrollerWorld",
  "showcaseVoxelBuilding",
  "showcaseSkylineCity",
  "showcaseOrangeIndustrialRobot",
  "showcaseRoboticWeldingWorkcell",
  "showcaseParticleCore",
  "showcaseMiniRaceTrack",
  "showcasePlatformHero",
  "showcaseSideScrollerPlatformLevel",
  "showcaseKenneyNeonRaceCircuit",
  "showcaseKenneyRaceCarRed",
  "showcaseCc0FormulaRaceCar",
  "showcaseCcByFormulaOpponent",
  "skylineWinterParallaxBackdrop",
  "skylineArcticRunnerHero",
  "skylineIceLedgeLong",
  "skylineIceLedgeMedium",
  "skylineIceLedgeCompact",
  "showcaseKenneyVerdantPlatformerWorld",
  "showcaseKenneyOobiPlatformerHero",
  "turboRaceCar",
  "propPineTree",
  "propBoulder",
  "propRockA",
  "propRockB",
  "propConifer"
] as const satisfies readonly ProbeAssetId[];

const propView = {
  targetMaxDimension: 3.4,
  cameraTargetMaxDimension: 3.4,
  padding: 1.18,
  fov: 31,
  azimuth: 0.72,
  elevation: 0.18,
  minForegroundWidth: 64,
  minForegroundHeight: 64
} as const satisfies Omit<ProbeConfig, "rotation">;

const mechPartView = {
  targetMaxDimension: 3.4,
  cameraTargetMaxDimension: 3.4,
  padding: 1.14,
  fov: 31,
  azimuth: 0.68,
  elevation: 0.16,
  rotation: [0, 0.5, 0] as AuraVec3,
  minForegroundWidth: 80,
  minForegroundHeight: 80
} as const satisfies ProbeConfig;

const mechChassisView = {
  ...mechPartView,
  minForegroundWidth: 140,
  minForegroundHeight: 110,
  orientation: {
    forwardAxis: "+Z", upAxis: "+Y",
    message: "The hash-bound original MH-2M torso is presented +Y-up and +Z-forward at its authored metre scale. It is a rigid modular character part only; no rig, skin, animation, or controller capability is inferred."
  }
} as const satisfies ProbeConfig;

const mechArmsView = { ...mechPartView, minForegroundWidth: 190, minForegroundHeight: 64 } as const satisfies ProbeConfig;
const mechLegsView = { ...mechPartView, minForegroundWidth: 115, minForegroundHeight: 120 } as const satisfies ProbeConfig;
const mechWeaponView = {
  ...mechPartView,
  minForegroundWidth: 75,
  minForegroundHeight: 110,
  orientation: {
    forwardAxis: "+Z", upAxis: "+Y",
    message: "The hash-bound original MH-2M weapon is presented +Y-up with its authored working end along +Z. This proves static held-weapon readability and socket orientation only; combat behavior remains route-local."
  }
} as const satisfies ProbeConfig;

const bankShotBallView = {
  targetMaxDimension: 2.8,
  cameraTargetMaxDimension: 2.8,
  padding: 1.08,
  fov: 30,
  azimuth: 0.7,
  elevation: 0.62,
  minForegroundWidth: 135,
  minForegroundHeight: 135,
  orientation: {
    forwardAxis: "+Z", upAxis: "+Y",
    message: "The hash-bound original Bank Shot ball is presented +Y-up from above so its renderer-owned solid/stripe treatment and high-contrast top identity mark are inspectable. Live translation comes from the public Rapier sphere body; no angular simulation is inferred."
  }
} as const satisfies ProbeConfig;

export const PROBE_CONFIGS: Readonly<Record<ProbeAssetId, ProbeConfig>> = {
  bankShotTable: {
    targetMaxDimension: 5.2,
    cameraTargetMaxDimension: 5.2,
    padding: 1.08,
    fov: 33,
    azimuth: 0.72,
    elevation: 0.52,
    rotation: [0, 0.35, 0],
    minForegroundWidth: 260,
    minForegroundHeight: 145,
    orientation: {
      forwardAxis: "+X", upAxis: "+Y",
      message: "The original metre-scale Bank Shot table is presented +Y-up with its long play axis along +X. This proves static table, rail, felt, leg, and six mouth readability only; contacts and pocket truth are separately route-tested."
    }
  },
  bankShotCue: {
    targetMaxDimension: 4.4,
    cameraTargetMaxDimension: 4.4,
    padding: 1.08,
    fov: 30,
    azimuth: 0.38,
    elevation: 0.28,
    rotation: [0, 0.35, 0.75],
    minForegroundWidth: 220,
    minForegroundHeight: 96,
    orientation: {
      forwardAxis: "+X", upAxis: "+Y",
      message: "The original Bank Shot cue is presented +Y-up with its strike tip at the local origin and shaft extending toward -X. Route-local aim/charge poses it; no cue-sports controller is inferred."
    }
  },
  bankShotBall00: bankShotBallView,
  bankShotBall01: bankShotBallView,
  bankShotBall02: bankShotBallView,
  bankShotBall03: bankShotBallView,
  bankShotBall04: bankShotBallView,
  bankShotBall05: bankShotBallView,
  bankShotBall06: bankShotBallView,
  bankShotBall07: bankShotBallView,
  bankShotBall08: bankShotBallView,
  bankShotBall09: bankShotBallView,
  bankShotBall10: bankShotBallView,
  bankShotBall11: bankShotBallView,
  bankShotBall12: bankShotBallView,
  bankShotBall13: bankShotBallView,
  bankShotBall14: bankShotBallView,
  bankShotBall15: bankShotBallView,
  rooftopCourt: {
    targetMaxDimension: 20,
    cameraTargetMaxDimension: 20,
    padding: 1.08,
    fov: 34,
    azimuth: 0.7,
    elevation: 0.48,
    rotation: [0, 0.25, 0],
    minForegroundWidth: 280,
    minForegroundHeight: 120,
    orientation: {
      forwardAxis: "+Z", upAxis: "+Y",
      message: "The hash-bound original Rooftop Buckets court is presented +Y-up at its authored metre scale. This proves only its readable world slab and bounds; route-local spots, lines, contacts, and ballistics are separately tested."
    }
  },
  rooftopBackboard: {
    targetMaxDimension: 3,
    cameraTargetMaxDimension: 3,
    padding: 1.08,
    fov: 30,
    azimuth: 0.38,
    elevation: 0.22,
    minForegroundWidth: 230,
    minForegroundHeight: 130,
    orientation: {
      forwardAxis: "+Z", upAxis: "+Y",
      message: "The hash-bound original Rooftop Buckets backboard is presented +Y-up and front-facing. Its metre-scale prop bounds align with the separately tested route-local board region."
    }
  },
  rooftopRim: {
    targetMaxDimension: 1,
    cameraTargetMaxDimension: 1,
    padding: 1.08,
    fov: 28,
    azimuth: 0.72,
    elevation: 0.72,
    minForegroundWidth: 180,
    minForegroundHeight: 110,
    orientation: {
      forwardAxis: "+Z", upAxis: "+Y",
      message: "The hash-bound original Rooftop Buckets rim is presented +Y-up from an elevated readable angle. The probe proves the prop only; composed contact and scoring authority remain route-local."
    }
  },
  rooftopBall: {
    targetMaxDimension: 2,
    cameraTargetMaxDimension: 2,
    padding: 1.08,
    fov: 28,
    azimuth: 0.65,
    elevation: 0.5,
    minForegroundWidth: 160,
    minForegroundHeight: 160,
    orientation: {
      forwardAxis: "+Z", upAxis: "+Y",
      message: "The hash-bound original unit-normalized Rooftop Buckets ball is presented +Y-up. The route scales it to 0.24 metres and binds translation to the separately tested authored flight state."
    }
  },
  rooftopDefender: {
    targetHeight: 2.4,
    cameraTargetHeight: 2.4,
    padding: 1.42,
    fov: 32,
    azimuth: 0.16,
    elevation: 0.1,
    minForegroundWidth: 90,
    minForegroundHeight: 220,
    orientation: {
      forwardAxis: "+Z", upAxis: "+Y",
      message: "The hash-bound CC-BY-4.0 Rooftop Buckets defender derivative is presented +Y-up and front-facing. Its 191-joint skin and Plant, Telegraph, Jump, and Contest clips are retained as authored deformation evidence; root placement, telegraph timing, collision, and scoring remain route-local."
    }
  },
  rooftopShooter: {
    targetHeight: 2.4,
    cameraTargetHeight: 2.4,
    padding: 1.42,
    fov: 32,
    azimuth: 0.16,
    elevation: 0.1,
    minForegroundWidth: 90,
    minForegroundHeight: 220,
    orientation: {
      forwardAxis: "+Z", upAxis: "+Y",
      message: "The hash-bound original Rooftop Buckets release sculpture is presented +Y-up and front-facing. Its planted bent-knee stance and high shooting-hand silhouette are static; the separately typed ball and deterministic route-local flight remain authoritative."
    }
  },
  rooftopLayupScorer: {
    targetHeight: 2.4,
    cameraTargetHeight: 2.4,
    padding: 1.42,
    fov: 32,
    azimuth: 0.16,
    elevation: 0.1,
    minForegroundWidth: 90,
    minForegroundHeight: 220,
    orientation: {
      forwardAxis: "+Z", upAxis: "+Y",
      message: "The hash-bound CC-BY-4.0 Rooftop Buckets scorer derivative is presented +Y-up and front-facing. Its 191-joint skin and Ready, Load, Release, and FollowThrough clips are retained as authored deformation evidence; root translation, the separately typed ball, and deterministic flight remain route-local."
    }
  },
  vaultBreakersTable: {
    targetMaxDimension: 10,
    cameraTargetMaxDimension: 10,
    padding: 1.18,
    fov: 34,
    azimuth: 0.68,
    elevation: 0.58,
    minForegroundWidth: 250,
    minForegroundHeight: 220,
    orientation: {
      forwardAxis: "+Z", upAxis: "+Y",
      message: "The hash-bound original Vault Breakers cabinet is presented +Y-up at metre scale. This proves its cabinet silhouette and materials only; the route-local playfield physics and mission mechanisms are separately tested."
    }
  },
  vaultBreakersMechanisms: {
    targetMaxDimension: 5.05,
    cameraTargetMaxDimension: 5.05,
    padding: 1.12,
    fov: 32,
    azimuth: 0.48,
    elevation: 0.62,
    minForegroundWidth: 240,
    minForegroundHeight: 150,
    orientation: {
      forwardAxis: "+Z", upAxis: "+Y",
      message: "The hash-bound original Vault Breakers mechanism overlay is presented +Y-up at its authored metre scale. It proves static bumper, target-bank, orbit, and vault landmark readability only; route-local Rapier bodies and sensors remain gameplay authority."
    }
  },
  vaultBreakersBall: {
    targetMaxDimension: 0.3,
    cameraTargetMaxDimension: 0.3,
    padding: 1.12,
    fov: 28,
    azimuth: 0.64,
    elevation: 0.48,
    minForegroundWidth: 170,
    minForegroundHeight: 170,
    orientation: {
      forwardAxis: "+Z", upAxis: "+Y",
      message: "The hash-bound original Vault Breakers chrome ball is presented +Y-up at its authored 0.28 metre diameter. Rapier motion and contact authority are separately proven by route tests."
    }
  },
  vaultBreakersFlipper: {
    targetMaxDimension: 1.1,
    cameraTargetMaxDimension: 1.1,
    padding: 1.18,
    fov: 28,
    azimuth: 0.62,
    elevation: 0.46,
    minForegroundWidth: 230,
    minForegroundHeight: 90,
    orientation: {
      forwardAxis: "+Z", upAxis: "+Y",
      message: "The hash-bound original Vault Breakers flipper is presented +Y-up with its pivot at the authored origin. The motorised hinge behavior and mirrored-axis workaround are separately pinned."
    }
  },
  vaultBreakersVaultDoor: {
    targetMaxDimension: 0.55,
    cameraTargetMaxDimension: 0.55,
    padding: 1.16,
    fov: 28,
    azimuth: 0.45,
    elevation: 0.2,
    minForegroundWidth: 180,
    minForegroundHeight: 180,
    orientation: {
      forwardAxis: "+Z", upAxis: "+Y",
      message: "The hash-bound original Vault Breakers vault door is presented +Y-up and front-readable. Its route-local authored opening and multiball transition are separately tested."
    }
  },
  galleryShiftMuseumInterior: {
    targetMaxDimension: 20.8,
    cameraTargetMaxDimension: 20.8,
    padding: 1.08,
    fov: 34,
    azimuth: 0.62,
    elevation: 0.52,
    minForegroundWidth: 280,
    minForegroundHeight: 170,
    orientation: {
      forwardAxis: "+Z", upAxis: "+Y",
      message: "The original Gallery Shift museum interior is presented +Y-up at its authored metre scale. It proves the floor-one shell, partitions, and service throat only; route-local colliders and perception queries remain separate gameplay authority."
    }
  },
  galleryShiftCutawayMuseumWorld: {
    targetMaxDimension: 20.84,
    cameraTargetMaxDimension: 20.84,
    padding: 1.04,
    fov: 39,
    azimuth: 0,
    elevation: 1.335,
    minForegroundWidth: 480,
    minForegroundHeight: 320,
    orientation: {
      forwardAxis: "+Z", upAxis: "+Y",
      message: "The original CC0 cutaway museum is presented +Y-up and roofless at authored metre scale. It proves visual rooms, door gaps, plinths, layered floors, and the exit landmark only; FloorLayout remains collision, perception, patrol, network, and gameplay authority."
    }
  },
  galleryShiftPedestal: {
    targetHeight: 1,
    cameraTargetHeight: 1,
    padding: 1.16,
    fov: 29,
    azimuth: 0.7,
    elevation: 0.28,
    minForegroundWidth: 130,
    minForegroundHeight: 190,
    orientation: { forwardAxis: "+Z", upAxis: "+Y", message: "The original Gallery Shift pedestal is presented +Y-up at one metre tall; objective state and occlusion are separately route-tested." }
  },
  galleryShiftExhibitA: {
    targetMaxDimension: 0.44, cameraTargetMaxDimension: 0.44, padding: 1.14, fov: 28, azimuth: 0.7, elevation: 0.3,
    minForegroundWidth: 180, minForegroundHeight: 150,
    orientation: { forwardAxis: "+Z", upAxis: "+Y", message: "The original lunar-orb exhibit is presented +Y-up; exact-once collection and visible removal are route-tested." }
  },
  galleryShiftExhibitB: {
    targetHeight: 0.48, cameraTargetHeight: 0.48, padding: 1.14, fov: 28, azimuth: 0.7, elevation: 0.28,
    minForegroundWidth: 140, minForegroundHeight: 180,
    orientation: { forwardAxis: "+Z", upAxis: "+Y", message: "The original stacked-statue exhibit is presented +Y-up; exact-once collection and visible removal are route-tested." }
  },
  galleryShiftExhibitC: {
    targetHeight: 0.31, cameraTargetHeight: 0.31, padding: 1.14, fov: 28, azimuth: 0.7, elevation: 0.28,
    minForegroundWidth: 140, minForegroundHeight: 180,
    orientation: { forwardAxis: "+Z", upAxis: "+Y", message: "The original capsule exhibit is presented +Y-up; its third-lift alarm transition is separately route-tested." }
  },
  galleryShiftDisplayCase: {
    targetMaxDimension: 1, cameraTargetMaxDimension: 1, padding: 1.14, fov: 29, azimuth: 0.7, elevation: 0.3,
    minForegroundWidth: 180, minForegroundHeight: 170,
    orientation: { forwardAxis: "+Z", upAxis: "+Y", message: "The original Gallery Shift display case is presented +Y-up; its matching solid collider and LOS occlusion are separately route-tested." }
  },
  deepRecoverySub: {
    targetMaxDimension: 3.2, cameraTargetMaxDimension: 3.2, padding: 1.18, fov: 29, azimuth: 0.72, elevation: 0.2,
    rotation: [0, 0.36, 0], minForegroundWidth: 190, minForegroundHeight: 120,
    orientation: { forwardAxis: "+Z", upAxis: "+Y", message: "The original Deep Recovery research submarine is presented +Y-up with its authored bow facing +Z. Route-local thrust, drag, buoyancy, collision, and grapple behavior are separately tested and are not inferred from this static probe." }
  },
  deepRecoveryWreckHull: {
    targetMaxDimension: 6.5, cameraTargetMaxDimension: 6.5, padding: 1.15, fov: 31, azimuth: 0.7, elevation: 0.36,
    minForegroundWidth: 220, minForegroundHeight: 150,
    orientation: { forwardAxis: "+Z", upAxis: "+Y", message: "The original Deep Recovery ironclad wreck is presented +Y-up at metre scale; authored collision spheres and sonar occlusion volumes remain separate route-local query authority." }
  },
  deepRecoveryCrateStandard: {
    targetMaxDimension: 1, cameraTargetMaxDimension: 1, padding: 1.15, fov: 29, azimuth: 0.68, elevation: 0.26,
    minForegroundWidth: 170, minForegroundHeight: 160,
    orientation: { forwardAxis: "+Z", upAxis: "+Y", message: "The original blue standard salvage pod is presented +Y-up; its 120 kg authored handling and bank value are separately route-tested." }
  },
  deepRecoveryCrateHeavy: {
    targetMaxDimension: 1.4, cameraTargetMaxDimension: 1.4, padding: 1.15, fov: 29, azimuth: 0.68, elevation: 0.26,
    minForegroundWidth: 180, minForegroundHeight: 165,
    orientation: { forwardAxis: "+Z", upAxis: "+Y", message: "The original amber heavy salvage pod is presented +Y-up; its 280+ kg authored tow drag and higher value are separately route-tested." }
  },
  deepRecoveryBuoyBeacon: {
    targetMaxDimension: 5.5, cameraTargetMaxDimension: 5.5, padding: 1.16, fov: 31, azimuth: 0.72, elevation: 0.28,
    minForegroundWidth: 180, minForegroundHeight: 160,
    orientation: { forwardAxis: "+Z", upAxis: "+Y", message: "The original Deep Recovery buoy station is presented +Y-up; its route-local bank, repair, oxygen, and surface zones are separately tested." }
  },
  patrolWingPlane: {
    targetMaxDimension: 2.3, cameraTargetMaxDimension: 2.3, padding: 1.2, fov: 29, azimuth: 0.72, elevation: 0.24,
    rotation: [0, 0.48, 0], minForegroundWidth: 210, minForegroundHeight: 110,
    orientation: { forwardAxis: "+X", upAxis: "+Y", message: "The original Patrol Wing cream/red aircraft is presented +Y-up with its authored nose facing +X. Route-local arcade response, collision, and landing classification are separately tested; this probe makes no aerodynamic claim." }
  },
  patrolWingDroneA: {
    targetMaxDimension: 1.45, cameraTargetMaxDimension: 1.45, padding: 1.16, fov: 29, azimuth: 0.68, elevation: 0.24,
    rotation: [0, 0.44, 0], minForegroundWidth: 160, minForegroundHeight: 150,
    orientation: { forwardAxis: "+X", upAxis: "+Y", message: "The original black/orange Patrol Wing drone A is presented +Y-up and +X-forward; seeded pursuit and combat hit truth are separately route-tested." }
  },
  patrolWingDroneB: {
    targetMaxDimension: 1.25, cameraTargetMaxDimension: 1.25, padding: 1.16, fov: 29, azimuth: 0.68, elevation: 0.24,
    rotation: [0, 0.44, 0], minForegroundWidth: 160, minForegroundHeight: 150,
    orientation: { forwardAxis: "+X", upAxis: "+Y", message: "The original alternate Patrol Wing drone B is presented +Y-up and +X-forward; seeded pursuit and combat hit truth are separately route-tested." }
  },
  patrolWingPadBeacon: {
    targetMaxDimension: 4.5, cameraTargetMaxDimension: 4.5, padding: 1.15, fov: 30, azimuth: 0.7, elevation: 0.42,
    minForegroundWidth: 220, minForegroundHeight: 120,
    orientation: { forwardAxis: "+X", upAxis: "+Y", message: "The original Patrol Wing pad/beacon assembly is presented +Y-up; its pinned sensor radius, approach bounds, and touchdown classification are separately route-tested." }
  },
  showcaseExpressiveRobot: {
    targetHeight: 1.9, cameraTargetHeight: 1.9, padding: 1.15, fov: 30, azimuth: 0.72, elevation: 0.16,
    rotation: [0, 0.35, 0], minForegroundWidth: 120, minForegroundHeight: 190,
    orientation: { forwardAxis: "+Z", upAxis: "+Y", message: "The repository-locked CC0 expressive robot is presented +Y-up as Gallery Shift's typed guard silhouette. Its clips are presentation only; authored patrol and perception truth are separately tested." }
  },
  mechChassisA: mechChassisView,
  mechChassisB: mechChassisView,
  mechChassisC: mechChassisView,
  mechChassisD: mechChassisView,
  mechArmsA: mechArmsView,
  mechArmsB: mechArmsView,
  mechArmsC: mechArmsView,
  mechArmsD: mechArmsView,
  mechLegsA: mechLegsView,
  mechLegsB: mechLegsView,
  mechLegsC: mechLegsView,
  mechLegsD: mechLegsView,
  mechWeaponA: mechWeaponView,
  mechWeaponB: mechWeaponView,
  mechWeaponC: mechWeaponView,
  mechWeaponD: mechWeaponView,
  neonCourierAvatar: {
    targetHeight: 2.8,
    cameraTargetHeight: 2.8,
    padding: 1.26,
    fov: 30,
    azimuth: 0.72,
    elevation: 0.16,
    rotation: [0, 0.64, 0],
    minForegroundWidth: 100,
    minForegroundHeight: 160,
    orientation: {
      forwardAxis: "+Z",
      upAxis: "+Y",
      message: "The current hash-bound courier is mounted upright (+Y) and uses the route's declared +Z neutral facing before authored yaw. This proves only a readable static character view; no rig, clip, or humanoid-controller claim is inferred."
    }
  },
  neonBarricadeProp: {
    ...propView,
    targetMaxDimension: 3.8,
    cameraTargetMaxDimension: 3.8,
    rotation: [0, 0.62, 0],
    minForegroundWidth: 130,
    minForegroundHeight: 130
  },
  neonStreetLampProp: {
    ...propView,
    targetMaxDimension: 3.8,
    cameraTargetMaxDimension: 3.8,
    rotation: [0, 0.48, 0],
    minForegroundWidth: 80,
    minForegroundHeight: 170
  },
  neonRainGardenArenaBackdrop: {
    targetMaxDimension: 8,
    cameraTargetMaxDimension: 8,
    padding: 1.02,
    fov: 36,
    azimuth: 0,
    elevation: 1.38,
    rotation: [0, 0, 0],
    minForegroundWidth: 410,
    minForegroundHeight: 240
  },
  neonRainCourierHero: {
    targetMaxDimension: 3.2,
    cameraTargetMaxDimension: 3.2,
    padding: 1.06,
    fov: 31,
    azimuth: 0,
    elevation: 1.35,
    rotation: [0, 0, 0],
    minForegroundWidth: 230,
    minForegroundHeight: 220,
    orientation: {
      forwardAxis: "+Z",
      upAxis: "+Y",
      message: "The project-original direct-overhead rain courier is packaged on an XZ presentation card with the authored pulse-tool direction toward +Z. The hash-bound probe proves static character readability only; movement, aiming, firing, health, and scoring remain route-local."
    }
  },
  neonCrownMothElite: {
    targetMaxDimension: 3.2,
    cameraTargetMaxDimension: 3.2,
    padding: 1.06,
    fov: 31,
    azimuth: 0,
    elevation: 1.35,
    rotation: [0, 0, 0],
    minForegroundWidth: 230,
    minForegroundHeight: 190,
    orientation: {
      forwardAxis: "+Z",
      upAxis: "+Y",
      message: "The project-original crown moth is packaged on an XZ presentation card with its authored attack direction toward +Z. The hash-bound probe proves static enemy-character readability only; live position, steering, contact, damage, and count remain route-local."
    }
  },
  auroraLanderProbe: {
    targetMaxDimension: 3.8,
    cameraTargetMaxDimension: 3.8,
    padding: 1.12,
    fov: 31,
    azimuth: 0.72,
    elevation: 0.22,
    rotation: [0, 0.62, 0],
    minForegroundWidth: 120,
    minForegroundHeight: 110,
    orientation: {
      forwardAxis: "+Z",
      upAxis: "+Y",
      message: "The original lander is authored +Y-up and uses +Z as its declared neutral forward axis; its flight model is intentionally single-lateral-axis, so no aerodynamic heading or physical thrust-vector claim is inferred."
    }
  },
  auroraPadBeacon: {
    targetMaxDimension: 3.2,
    cameraTargetMaxDimension: 3.2,
    padding: 1.16,
    fov: 31,
    azimuth: 0.68,
    elevation: 0.2,
    rotation: [0, 0.54, 0],
    minForegroundWidth: 75,
    minForegroundHeight: 130
  },
  auroraExtractionBayBackdrop: {
    targetMaxDimension: 8,
    cameraTargetMaxDimension: 8,
    padding: 1.02,
    fov: 36,
    azimuth: 0,
    elevation: 0,
    rotation: [0, 0, 0],
    minForegroundWidth: 420,
    minForegroundHeight: 240
  },
  auroraExtractionLanderHero: {
    targetMaxDimension: 3.2,
    cameraTargetMaxDimension: 3.2,
    padding: 1.08,
    fov: 31,
    azimuth: 0,
    elevation: 0,
    rotation: [0, 0, 0],
    minForegroundWidth: 220,
    minForegroundHeight: 240,
    orientation: {
      forwardAxis: "+Z",
      upAxis: "+Y",
      message: "The project-original extraction lander is authored as a front-readable XY presentation card with its visible face toward +Z and antenna-up along +Y; the current hash-bound root probe verifies that static vehicle presentation only."
    }
  },
  gravityPostMailPod: {
    targetMaxDimension: 3.8,
    cameraTargetMaxDimension: 3.8,
    padding: 1.15,
    fov: 31,
    azimuth: 0.78,
    elevation: 0.18,
    rotation: [0, 0.64, 0],
    minForegroundWidth: 130,
    minForegroundHeight: 110,
    orientation: {
      forwardAxis: "+Z",
      upAxis: "+Y",
      message: "The current hash-bound pod is presented +Y-up with +Z as the route's neutral authored yaw reference. This is a readable static vehicle view only; it does not infer physical spacecraft orientation, thrust, or flight dynamics."
    }
  },
  gravityPostDockBeacon: {
    targetMaxDimension: 3.8,
    cameraTargetMaxDimension: 3.8,
    padding: 1.12,
    fov: 31,
    azimuth: 0.72,
    elevation: 0.24,
    rotation: [0, 0.52, 0],
    minForegroundWidth: 150,
    minForegroundHeight: 100
  },
  gravityPostFreightDistrict: {
    targetMaxDimension: 12.9,
    cameraTargetMaxDimension: 12.9,
    padding: 1.04,
    fov: 38,
    azimuth: 0.72,
    elevation: 0.34,
    rotation: [0, 0, 0],
    minForegroundWidth: 360,
    minForegroundHeight: 230,
    orientation: {
      forwardAxis: "+X",
      upAxis: "+Y",
      message: "The original static Gravity Post freight district is authored +Y-up with its connected Rust-to-Gale deck extending along +X. The hash-bound probe proves its nine-material loading hangar, crane, cargo, tank-farm, rail, and terminal architecture only; route-local pod motion, gravity wells, sensors, collision, scoring, and camera remain authoritative."
    }
  },
  gravityPostCourierSkiff: {
    targetMaxDimension: 3.8,
    cameraTargetMaxDimension: 3.8,
    padding: 1.1,
    fov: 31,
    azimuth: 0.72,
    elevation: 0.2,
    rotation: [0, 0.52, 0],
    minForegroundWidth: 150,
    minForegroundHeight: 100,
    orientation: {
      forwardAxis: "+Z",
      upAxis: "+Y",
      message: "The original Gravity Post courier skiff is authored +Y-up and +Z-forward. The hash-bound probe proves its compact four-pod working-vehicle silhouette and guarded parcel module only; route-local motion, sensors, collision, scoring, and delivery state remain authoritative."
    }
  },
  pulseReactorEncounterWorld: {
    targetMaxDimension: 11.8,
    cameraTargetMaxDimension: 11.8,
    padding: 1.04,
    fov: 38,
    azimuth: 0.54,
    elevation: 0.3,
    rotation: [0, 0, 0],
    minForegroundWidth: 380,
    minForegroundHeight: 220,
    orientation: {
      forwardAxis: "+Z",
      upAxis: "+Y",
      message: "The original static Pulse reactor encounter world is authored +Y-up with its continuous deck extending along Z. The probe proves only its connected decorative enclosure, terminal bay, and named fire/impact presentation anchors; collision, lanes, gates, projectiles, and outcomes remain route-local."
    }
  },
  pulseTerminalSentry: {
    targetMaxDimension: 3.1,
    cameraTargetMaxDimension: 3.1,
    padding: 1.08,
    fov: 31,
    azimuth: 0.5,
    elevation: 0.18,
    rotation: [0, 0, 0],
    minForegroundWidth: 160,
    minForegroundHeight: 170,
    orientation: {
      forwardAxis: "+Z",
      upAxis: "+Y",
      message: "The original rigid Pulse terminal sentry is presented +Y-up and +Z-forward at its authored metre scale. This proves static armour, mechanics, reactor, optics, wing, and claw readability only; no rig, skin, animation, aiming, damage, or projectile behavior is inferred."
    }
  },
  pulseRunnerCraft: {
    targetMaxDimension: 3.1,
    cameraTargetMaxDimension: 3.1,
    padding: 1.08,
    fov: 31,
    azimuth: 0.64,
    elevation: 0.2,
    rotation: [0, 0, 0],
    minForegroundWidth: 180,
    minForegroundHeight: 90,
    orientation: {
      forwardAxis: "+Z",
      upAxis: "+Y",
      message: "The original rigid Pulse runner is presented +Y-up and +Z-forward at its authored metre scale. This proves static nose, foil, chassis, canopy, and drive-pod readability only; lane movement, jump, slide, shield, collision, and scoring remain route-local."
    }
  },
  courierVan: {
    targetMaxDimension: 4.2,
    cameraTargetMaxDimension: 4.2,
    padding: 1.12,
    fov: 31,
    azimuth: 0.78,
    elevation: 0.2,
    rotation: [0, 0.72, 0],
    minForegroundWidth: 150,
    minForegroundHeight: 85,
    orientation: {
      forwardAxis: "+Z", upAxis: "+Y",
      message: "The hash-bound van is presented +Y-up with +Z as the route's neutral authored heading before route-local yaw. This proves only static readability and normalization; no physical vehicle orientation or dynamics are inferred."
    }
  },
  courierParcel: {
    targetMaxDimension: 3.0,
    cameraTargetMaxDimension: 3.0,
    padding: 1.18,
    fov: 31,
    azimuth: 0.7,
    elevation: 0.25,
    rotation: [0, 0.5, 0],
    minForegroundWidth: 110,
    minForegroundHeight: 90,
    orientation: {
      forwardAxis: "+Z", upAxis: "+Y",
      message: "The hash-bound parcel is presented +Y-up with +Z as its route-authored neutral view before it is visibly attached to the van bed."
    }
  },
  courierTrafficSedan: {
    targetMaxDimension: 4.0,
    cameraTargetMaxDimension: 4.0,
    padding: 1.14,
    fov: 31,
    azimuth: 0.78,
    elevation: 0.2,
    rotation: [0, 0.72, 0],
    minForegroundWidth: 145,
    minForegroundHeight: 75,
    orientation: {
      forwardAxis: "+Z", upAxis: "+Y",
      message: "The hash-bound sedan is presented +Y-up with +Z as the route's neutral lane heading before authored lane-loop yaw; no physical driving claim is inferred."
    }
  },
  courierTrafficHatch: {
    targetMaxDimension: 4.0,
    cameraTargetMaxDimension: 4.0,
    padding: 1.14,
    fov: 31,
    azimuth: 0.78,
    elevation: 0.2,
    rotation: [0, 0.72, 0],
    minForegroundWidth: 140,
    minForegroundHeight: 80,
    orientation: {
      forwardAxis: "+Z", upAxis: "+Y",
      message: "The hash-bound hatch is presented +Y-up with +Z as the route's neutral lane heading before authored lane-loop yaw; no physical driving claim is inferred."
    }
  },
  courierZoneAwning: {
    targetMaxDimension: 3.6,
    cameraTargetMaxDimension: 3.6,
    padding: 1.16,
    fov: 32,
    azimuth: 0.7,
    elevation: 0.24,
    rotation: [0, 0.48, 0],
    minForegroundWidth: 120,
    minForegroundHeight: 100,
    orientation: {
      forwardAxis: "+Z", upAxis: "+Y",
      message: "The hash-bound awning is presented +Y-up with a +Z neutral landmark view; it remains typed set dressing beside route-local sensor truth."
    }
  },
  courierZoneBollard: {
    targetMaxDimension: 3.0,
    cameraTargetMaxDimension: 3.0,
    padding: 1.18,
    fov: 31,
    azimuth: 0.7,
    elevation: 0.2,
    rotation: [0, 0.4, 0],
    minForegroundWidth: 70,
    minForegroundHeight: 120,
    orientation: {
      forwardAxis: "+Z", upAxis: "+Y",
      message: "The hash-bound bollard is presented +Y-up with a +Z neutral prop view; it remains typed curb and zone dressing, not the gameplay sensor."
    }
  },
  siegeGolfCourseWorld: {
    targetMaxDimension: 24,
    cameraTargetMaxDimension: 24,
    padding: 1.08,
    fov: 38,
    azimuth: 0.62,
    elevation: 0.42,
    rotation: [0, 0, 0],
    minForegroundWidth: 250,
    minForegroundHeight: 160,
    orientation: {
      forwardAxis: "-Z", upAxis: "+Y",
      message: "The Siege Golf course world is authored in metre-scale +Y-up coordinates, with the tee at positive Z and the fortress target/horizon toward -Z. It is a visual world; documented route-local Rapier felt and rails own collision."
    }
  },
  siegeGolfBall: {
    targetMaxDimension: 2.8,
    cameraTargetMaxDimension: 2.8,
    padding: 1.12,
    fov: 31,
    azimuth: 0.72,
    elevation: 0.2,
    minForegroundWidth: 130,
    minForegroundHeight: 130
  },
  siegeWoodenCrate: { ...propView, rotation: [0, 0.62, 0], minForegroundWidth: 130, minForegroundHeight: 130 },
  siegeWoodenBarrel: { ...propView, rotation: [0, 0.54, 0], minForegroundWidth: 110, minForegroundHeight: 150 },
  siegePlankSet: {
    targetMaxDimension: 4.2,
    cameraTargetMaxDimension: 4.2,
    padding: 1.08,
    fov: 31,
    azimuth: 0.7,
    elevation: 0.24,
    rotation: [0.18, 0.68, 0],
    minForegroundWidth: 100,
    minForegroundHeight: 150
  },
  showcaseDetailedRaceCircuit: { targetMaxDimension: 5.8, cameraTargetMaxDimension: 5.8, padding: 1.12, fov: 34, azimuth: 0.62, elevation: 0.58, rotation: [-1.5708, 0, 0], minForegroundWidth: 180, minForegroundHeight: 120 },
  showcaseRaceGameEnvironment: { targetMaxDimension: 5.8, cameraTargetMaxDimension: 5.8, padding: 1.12, fov: 34, azimuth: 0.62, elevation: 0.5, minForegroundWidth: 180, minForegroundHeight: 120 },
  showcaseIsometricRaceTrack: { targetMaxDimension: 5.8, cameraTargetMaxDimension: 5.8, padding: 1.1, fov: 34, azimuth: 0.62, elevation: 0.62, minForegroundWidth: 180, minForegroundHeight: 120 },
  showcaseSouthGardaTrack: { targetMaxDimension: 5.8, cameraTargetMaxDimension: 5.8, padding: 1.1, fov: 34, azimuth: 0.62, elevation: 0.62, minForegroundWidth: 180, minForegroundHeight: 120 },
  showcaseSmallCarRacingEnvironment: { targetMaxDimension: 5.8, cameraTargetMaxDimension: 5.8, padding: 1.1, fov: 34, azimuth: 0.62, elevation: 0.58, minForegroundWidth: 180, minForegroundHeight: 120 },
  showcaseHighpolySportsCar: { targetMaxDimension: 4.2, cameraTargetMaxDimension: 4.2, padding: 1.12, fov: 31, azimuth: 0.78, elevation: 0.2, rotation: [0, 0.82, 0], minForegroundWidth: 100, minForegroundHeight: 60 },
  showcaseRaceCar: { targetMaxDimension: 4.2, cameraTargetMaxDimension: 4.2, padding: 1.12, fov: 31, azimuth: 0.78, elevation: 0.2, rotation: [0, 0.82, 0], minForegroundWidth: 100, minForegroundHeight: 60 },
  showcasePlatformerWorldLevel: { targetMaxDimension: 5.4, cameraTargetMaxDimension: 5.4, padding: 1.1, fov: 34, azimuth: 0.72, elevation: 0.34, minForegroundWidth: 180, minForegroundHeight: 120 },
  showcaseFloatingIslandWorld: { targetMaxDimension: 5.2, cameraTargetMaxDimension: 5.2, padding: 1.1, fov: 34, azimuth: 0.72, elevation: 0.34, minForegroundWidth: 180, minForegroundHeight: 120 },
  showcaseReadablePlatformLevel: { targetMaxDimension: 5.4, cameraTargetMaxDimension: 5.4, padding: 1.1, fov: 34, azimuth: 0.72, elevation: 0.34, minForegroundWidth: 180, minForegroundHeight: 120 },
  showcaseRooftopParkourWorld: { targetMaxDimension: 5.4, cameraTargetMaxDimension: 5.4, padding: 1.1, fov: 34, azimuth: 0.72, elevation: 0.34, minForegroundWidth: 180, minForegroundHeight: 120 },
  showcaseRunnerRobot: { targetMaxDimension: 3.4, cameraTargetMaxDimension: 3.4, padding: 1.05, fov: 30, azimuth: 0.76, elevation: 0.16, rotation: [-1.5708, 0.5, 0], minForegroundWidth: 90, minForegroundHeight: 140 },
  showcasePlatformRunnerHero: { targetMaxDimension: 3.4, cameraTargetMaxDimension: 3.4, padding: 1.05, fov: 30, azimuth: 0.76, elevation: 0.16, minForegroundWidth: 90, minForegroundHeight: 140 },
  showcaseStylizedMaleRunner: { targetHeight: 3.0, cameraTargetHeight: 3.0, padding: 1.05, fov: 30, azimuth: 0.76, elevation: 0.16, minForegroundWidth: 90, minForegroundHeight: 140 },
  showcaseArchitectureCityBlock: {
    targetMaxDimension: 5.2,
    cameraTargetMaxDimension: 5.2,
    padding: 1.12,
    fov: 34,
    azimuth: 0.68,
    elevation: 0.48,
    rotation: [0, -0.28, 0],
    minForegroundWidth: 260,
    minForegroundHeight: 120
  },
  showcaseArcadeCabinet: { ...propView, padding: 1.2, fov: 32, rotation: [0, 0.54, 0] },
  showcaseArcadeController: {
    targetMaxDimension: 5.8,
    cameraTargetMaxDimension: 3.8,
    padding: 1.08,
    fov: 32,
    azimuth: 0.42,
    elevation: 0.34,
    rotation: [-0.18, 1.42, 0],
    minForegroundWidth: 64,
    minForegroundHeight: 64
  },
  showcaseBlockfallCabinet: { ...propView, rotation: [0, 0.58, 0] },
  blockfallReactorArenaBackdrop: {
    targetMaxDimension: 8,
    cameraTargetMaxDimension: 8,
    padding: 1.02,
    fov: 36,
    azimuth: 0,
    elevation: 0,
    rotation: [0, 0, 0],
    minForegroundWidth: 420,
    minForegroundHeight: 240
  },
  blockfallReactorMechanicHero: {
    targetMaxDimension: 3.2,
    cameraTargetMaxDimension: 3.2,
    padding: 1.08,
    fov: 31,
    azimuth: 0,
    elevation: 0,
    rotation: [0, 0, 0],
    minForegroundWidth: 210,
    minForegroundHeight: 240,
    orientation: {
      forwardAxis: "+Z",
      upAxis: "+Y",
      message: "The project-original reactor mechanic is authored as a front-readable XY presentation card with its visible face toward +Z and head-up along +Y; the current hash-bound root probe verifies that static character presentation only."
    }
  },
  blockfallReactorPlasmaRival: {
    targetMaxDimension: 3.2,
    cameraTargetMaxDimension: 3.2,
    padding: 1.08,
    fov: 31,
    azimuth: 0,
    elevation: 0,
    rotation: [0, 0, 0],
    minForegroundWidth: 240,
    minForegroundHeight: 230,
    orientation: {
      forwardAxis: "+Z",
      upAxis: "+Y",
      message: "The project-original plasma rival is authored as a front-readable XY presentation card with its visible face toward +Z and crown-up along +Y; the current hash-bound root probe verifies that static character presentation only."
    }
  },
  showcaseCityVehicle: {
    targetHeight: 2.9,
    padding: 1.18,
    fov: 32,
    azimuth: 0.82,
    elevation: 0.18,
    rotation: [0, 0.82, 0],
    minForegroundWidth: 150,
    minForegroundHeight: 100
  },
  // Candidate midground/background props for the platformer composition layer. Screened, not adopted:
  // an isolated render is required before either can be used as set dressing.
  propPineTree: propView,
  propBoulder: propView,
  propRockA: propView,
  propRockB: propView,
  propConifer: propView,
  turboRaceCar: {
    targetHeight: 2.9,
    padding: 1.18,
    fov: 32,
    azimuth: 0.82,
    elevation: 0.18,
    rotation: [0, 0.82, 0],
    minForegroundWidth: 150,
    minForegroundHeight: 100
  },
  showcaseOrangeIndustrialRobot: {
    targetMaxDimension: 3.1,
    cameraTargetMaxDimension: 3.1,
    padding: 1.12,
    fov: 32,
    azimuth: 0.76,
    elevation: 0.22,
    rotation: [0, 0.62, 0],
    minForegroundWidth: 110,
    minForegroundHeight: 110
  },
  showcaseMiniRaceTrack: {
    targetMaxDimension: 5.4,
    cameraTargetMaxDimension: 5.4,
    padding: 1.12,
    fov: 34,
    azimuth: 0.52,
    elevation: 0.58,
    rotation: [-1.5708, 0, -0.18],
    minForegroundWidth: 210,
    minForegroundHeight: 150
  },
  showcaseParticleCore: {
    targetMaxDimension: 2.8,
    cameraTargetMaxDimension: 2.8,
    padding: 1.14,
    fov: 31,
    azimuth: 0.54,
    elevation: 0.24,
    rotation: [0, 0.72, 0],
    minForegroundWidth: 100,
    minForegroundHeight: 100
  },
  showcasePlatformHero: {
    targetHeight: 8.4,
    cameraTargetHeight: 2.75,
    padding: 0.92,
    fov: 27,
    azimuth: 0.58,
    elevation: 0.18,
    rotation: [0, 0.72, 0],
    orientation: {
      forwardAxis: "+Z",
      upAxis: "+Y",
      message: "The current hash-bound Kenney character is mounted upright (+Y) and reviewed with +Z as its neutral route-facing axis; this proves only a readable static character view."
    },
    minForegroundWidth: 96,
    minForegroundHeight: 160
  },

  showcasePlatformerWorldLevel: {
    targetMaxDimension: 4.2,
    cameraTargetMaxDimension: 4.2,
    padding: 1.12,
    fov: 34,
    azimuth: 0.68,
    elevation: 0.34,
    rotation: [0, -0.32, 0],
    minForegroundWidth: 280,
    minForegroundHeight: 160
  },
  showcaseRoboticWeldingWorkcell: {
    targetMaxDimension: 4.4,
    cameraTargetMaxDimension: 4.4,
    padding: 1.16,
    fov: 35,
    azimuth: 0.74,
    elevation: 0.3,
    rotation: [0, 0.34, 0],
    minForegroundWidth: 180,
    minForegroundHeight: 120
  },
  showcaseSidekickRunner: {
    targetHeight: 8.4,
    cameraTargetHeight: 2.75,
    padding: 0.92,
    fov: 27,
    azimuth: 0.58,
    elevation: 0.18,
    rotation: [0, 0.72, 0],
    minForegroundWidth: 96,
    minForegroundHeight: 160
  },
  showcaseSideScrollerWorld: {
    targetMaxDimension: 4.3,
    cameraTargetMaxDimension: 4.3,
    padding: 1.1,
    fov: 33,
    azimuth: 0.74,
    elevation: 0.3,
    rotation: [0, -0.22, 0],
    minForegroundWidth: 280,
    minForegroundHeight: 160
  },
  showcaseSkylineCity: {
    targetMaxDimension: 4.8,
    cameraTargetMaxDimension: 4.8,
    padding: 1.16,
    fov: 36,
    azimuth: 0.72,
    elevation: 0.32,
    rotation: [0, -0.14, 0],
    minForegroundWidth: 160,
    minForegroundHeight: 120
  },
  showcaseSideScrollerPlatformLevel: {
    targetMaxDimension: 4.3,
    cameraTargetMaxDimension: 4.3,
    padding: 1.1,
    fov: 33,
    azimuth: 0.74,
    elevation: 0.3,
    rotation: [0, -0.22, 0],
    minForegroundWidth: 280,
    minForegroundHeight: 160
  },

  showcaseTexturedSportsCar: {
    targetMaxDimension: 4.2,
    cameraTargetMaxDimension: 4.2,
    padding: 1.14,
    fov: 31,
    azimuth: 0.78,
    elevation: 0.18,
    rotation: [0, 0.82, 0],
    minForegroundWidth: 120,
    minForegroundHeight: 50
  },
  showcaseTsukubaCircuit: {
    targetMaxDimension: 5.8,
    cameraTargetMaxDimension: 5.8,
    padding: 1.16,
    fov: 34,
    azimuth: 0.64,
    elevation: 0.56,
    rotation: [0, -0.32, 0],
    minForegroundWidth: 224,
    minForegroundHeight: 120
  },
  turboFormulaCircuit: {
    targetMaxDimension: 5.8,
    cameraTargetMaxDimension: 5.8,
    padding: 1.16,
    fov: 34,
    azimuth: 0.64,
    elevation: 0.56,
    rotation: [0, -0.32, 0],
    minForegroundWidth: 224,
    minForegroundHeight: 120,
    orientation: {
      forwardAxis: "+Z",
      upAxis: "+Y",
      message: "The authored circuit declares +Y up and its isolated root probe validates the typed track presentation."
    }
  },
  showcaseVoxelBuilding: {
    targetMaxDimension: 3.6,
    cameraTargetMaxDimension: 3.6,
    padding: 1.14,
    fov: 34,
    azimuth: 0.7,
    elevation: 0.32,
    rotation: [0, 0.42, 0],
    minForegroundWidth: 120,
    minForegroundHeight: 120
  },
  showcaseWalkAnimatedGirl: {
    targetHeight: 3.0,
    padding: 1.16,
    fov: 31,
    azimuth: 0.96,
    elevation: 0.1,
    rotation: [0, 0.9, 0],
    minForegroundWidth: 130,
    minForegroundHeight: 240
  },
  showcaseKenneyNeonRaceCircuit: {
    targetMaxDimension: 6.4,
    cameraTargetMaxDimension: 6.4,
    padding: 1.12,
    fov: 34,
    azimuth: 0.7,
    elevation: 0.62,
    minForegroundWidth: 260,
    minForegroundHeight: 150
  },
  showcaseKenneyRaceCarRed: {
    targetMaxDimension: 3.8,
    cameraTargetMaxDimension: 3.8,
    padding: 1.16,
    fov: 31,
    azimuth: 0.82,
    elevation: 0.2,
    rotation: [0, 0.72, 0],
    minForegroundWidth: 120,
    minForegroundHeight: 70
  },
  showcaseCc0FormulaRaceCar: {
    targetMaxDimension: 3.8,
    cameraTargetMaxDimension: 3.8,
    padding: 1.12,
    fov: 31,
    azimuth: 0.82,
    elevation: 0.2,
    rotation: [0, 0.72, 0],
    minForegroundWidth: 150,
    minForegroundHeight: 80
  },
  showcaseCcByFormulaOpponent: {
    targetMaxDimension: 3.8,
    cameraTargetMaxDimension: 3.8,
    padding: 1.12,
    fov: 31,
    azimuth: 0.82,
    elevation: 0.2,
    rotation: [0, 0.72, 0],
    minForegroundWidth: 150,
    minForegroundHeight: 80
  },
  skylineWinterParallaxBackdrop: {
    targetMaxDimension: 8,
    cameraTargetMaxDimension: 8,
    padding: 1.02,
    fov: 36,
    azimuth: 0,
    elevation: 0,
    rotation: [0, 0, 0],
    minForegroundWidth: 420,
    minForegroundHeight: 220
  },
  skylineArcticRunnerHero: {
    targetMaxDimension: 3.2,
    cameraTargetMaxDimension: 3.2,
    padding: 1.08,
    fov: 32,
    azimuth: 0,
    elevation: 0,
    rotation: [0, 0, 0],
    minForegroundWidth: 170,
    minForegroundHeight: 220,
    orientation: {
      forwardAxis: "+Z",
      upAxis: "+Y",
      message: "The project-original runner is authored as a front-readable XY sprite plane with its visible face toward +Z and head-up along +Y; the current hash-bound root probe verifies that presentation."
    }
  },
  skylineIceLedgeLong: {
    targetMaxDimension: 5.2,
    cameraTargetMaxDimension: 5.2,
    padding: 1.04,
    fov: 32,
    azimuth: 0,
    elevation: 0,
    rotation: [0, 0, 0],
    minForegroundWidth: 360,
    minForegroundHeight: 90
  },
  skylineIceLedgeMedium: {
    targetMaxDimension: 4.2,
    cameraTargetMaxDimension: 4.2,
    padding: 1.04,
    fov: 32,
    azimuth: 0,
    elevation: 0,
    rotation: [0, 0, 0],
    minForegroundWidth: 300,
    minForegroundHeight: 100
  },
  skylineIceLedgeCompact: {
    targetMaxDimension: 3.4,
    cameraTargetMaxDimension: 3.4,
    padding: 1.04,
    fov: 32,
    azimuth: 0,
    elevation: 0,
    rotation: [0, 0, 0],
    minForegroundWidth: 220,
    minForegroundHeight: 110
  },
  showcaseKenneyVerdantPlatformerWorld: {
    // Sized by height, not max dimension. This asset is a wide platformer strip whose
    // real scene-space extent is roughly 91.5 x 14.4 x 10.9, so fitting the largest
    // dimension fits its *width* and leaves the mesh only ~0.85 units tall — a sliver
    // in frame. The previous max-dimension config only looked correct because the
    // manifest recorded an ~8x-too-small X extent before scene-space bounds were fixed.
    // targetHeight and cameraTargetHeight move together, so raising both only rescales
    // camera and model in lockstep and changes nothing on screen. Framing is controlled
    // by padding below.
    targetMaxDimension: 8,
    // Render at the route's max-dimension normalization, then inspect a
    // representative center crop so terrain/material readability is measurable
    // instead of shrinking the complete 838-unit strip into a 17 px sliver.
    cameraTargetMaxDimension: 0.62,
    // Padding below 1 deliberately crops the extreme horizontal ends of this strip so
    // the playable band is large enough to inspect. The final compositor deliberately
    // removed the repeated background mountains, leaving an honest 131-134 px terrain
    // band at this whole-world probe scale.
    padding: 0.86,
    fov: 34,
    azimuth: 0,
    elevation: 0.08,
    // Keep the long strip on its authored side-scroller plane. Even a small yaw
    // rotates its far-offset geometry around the GLB origin and moves every
    // primitive outside the camera frustum.
    rotation: [0, 0, 0],
    minForegroundWidth: 280,
    // This is a wide world strip, not a hero/prop presentation. Require the
    // retained playable terrain to clear 130 px; the removed decorative peaks
    // must not be counted as evidence of platform readability.
    minForegroundHeight: 130
  },
  showcaseKenneyOobiPlatformerHero: {
    targetHeight: 3.0,
    cameraTargetHeight: 3.0,
    padding: 1.12,
    fov: 31,
    azimuth: 0.8,
    elevation: 0.14,
    rotation: [0, 0.45, 0],
    minForegroundWidth: 110,
    minForegroundHeight: 180
  }
};
