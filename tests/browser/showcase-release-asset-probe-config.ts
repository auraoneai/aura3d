import type { AuraVec3 } from "@aura3d/engine";

export type ProbeAssetId =
  | "showcaseArcadeCabinet"
  | "showcaseArcadeController"
  | "showcaseBlockfallCabinet"
  | "showcaseCityVehicle"
  | "showcaseOrangeIndustrialRobot"
  | "showcaseParticleCore"
  | "showcasePlatformerWorldLevel"
  | "showcaseRoboticWeldingWorkcell"
  | "showcaseSidekickRunner"
  | "showcaseSideScrollerWorld"
  | "showcaseSkylineCity"
  | "showcaseTexturedSportsCar"
  | "showcaseTsukubaCircuit"
  | "showcaseVoxelBuilding"
  | "showcaseWalkAnimatedGirl";

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
  "showcaseParticleCore"
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
  }
};
