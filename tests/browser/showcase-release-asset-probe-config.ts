import type { AuraVec3 } from "@aura3d/engine";

export type ProbeAssetId =
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
  | "showcaseVoxelBuilding"
  | "showcaseWalkAnimatedGirl"
  | "showcaseKenneyNeonRaceCircuit"
  | "showcaseKenneyRaceCarRed"
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
}

export const PROBE_ASSETS = [
  "showcaseArchitectureCityBlock",
  "showcaseArcadeCabinet",
  "showcaseArcadeController",
  "showcaseBlockfallCabinet",
  "showcaseTexturedSportsCar",
  "showcaseTsukubaCircuit",
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

export const PROBE_CONFIGS: Readonly<Record<ProbeAssetId, ProbeConfig>> = {
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
  showcaseKenneyVerdantPlatformerWorld: {
    // Sized by height, not max dimension. This asset is a wide platformer strip whose
    // real scene-space extent is roughly 91.5 x 14.4 x 10.9, so fitting the largest
    // dimension fits its *width* and leaves the mesh only ~0.85 units tall — a sliver
    // in frame. The previous max-dimension config only looked correct because the
    // manifest recorded an ~8x-too-small X extent before scene-space bounds were fixed.
    // targetHeight and cameraTargetHeight move together, so raising both only rescales
    // camera and model in lockstep and changes nothing on screen. Framing is controlled
    // by padding below.
    targetHeight: 4.6,
    cameraTargetHeight: 4.6,
    // Padding below 1 deliberately crops the extreme horizontal ends of this strip so
    // the playable band is large enough to inspect. At 1.02 the subject measured
    // 510x135 px against a 150 px minimum height; 0.86 brings the height above the
    // minimum while the width stays inside the probe canvas.
    padding: 0.86,
    fov: 34,
    azimuth: 0.45,
    elevation: 0.24,
    rotation: [0, -0.12, 0],
    minForegroundWidth: 280,
    minForegroundHeight: 150
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
