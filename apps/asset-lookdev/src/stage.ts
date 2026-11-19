/**
 * lookdev.stage.json v1 loader — the shared stage both adapters read so the
 * Aura and three renders are staged identically (§6.7).
 */

export interface LookdevStageHdri {
  readonly id: string;
  readonly path: string;
  readonly intensity: number;
  readonly note?: string;
}

export interface LookdevStageCamera {
  readonly distance?: number;
  readonly distanceScale?: number;
  readonly fovDegrees: number;
}

export interface LookdevStage {
  readonly schema: "aura3d.lookdev-stage/1";
  readonly version: number;
  readonly hdris: readonly LookdevStageHdri[];
  readonly ground: { readonly kind: "shadow-catcher"; readonly color: string };
  readonly contact: {
    readonly fovDegrees: number;
    readonly elevationDegrees: number;
    readonly yawStops: number;
    readonly yawStepDegrees: number;
    readonly topDownElevationDegrees: number;
    readonly autofit: string;
  };
  readonly gameplay: Readonly<Record<string, LookdevStageCamera>>;
  readonly debugViews: readonly string[];
  readonly capture: {
    readonly desktop: { readonly width: number; readonly height: number; readonly dpr: number };
    readonly mobile: { readonly width: number; readonly height: number; readonly dpr: number };
  };
  readonly toneMapping: "aces";
  readonly exposure: number;
}

export const LOOKDEV_STAGE_URL = "/apps/asset-lookdev/lookdev.stage.json";

export async function loadLookdevStage(): Promise<LookdevStage> {
  const response = await fetch(LOOKDEV_STAGE_URL);
  if (!response.ok) throw new Error(`stage fetch failed: ${response.status}`);
  const stage = (await response.json()) as LookdevStage;
  if (stage.schema !== "aura3d.lookdev-stage/1") {
    throw new Error(`unsupported stage schema ${stage.schema}`);
  }
  return stage;
}
