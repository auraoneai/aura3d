import { solveTwoBoneIk, type TwoBoneIkResult } from "@aura3d/animation";

export type Vec3 = [number, number, number];

export interface IkTargetState {
  target: Vec3;
  pole: Vec3;
  weight: number;
  allowStretch: boolean;
}

export interface IkPose {
  root: Vec3;
  mid: Vec3;
  end: Vec3;
  result: TwoBoneIkResult;
}

const importedSkeletonFixture = {
  root: [-0.45, 1.18, 0] as Vec3,
  mid: [0.06, 0.78, 0] as Vec3,
  end: [0.48, 0.34, 0] as Vec3
};

export function createDefaultIkTargetState(): IkTargetState {
  return {
    target: [0.7, 0.55, 0],
    pole: [-0.2, 1.38, 0.18],
    weight: 1,
    allowStretch: false
  };
}

export function solveImportedFixtureIk(state: IkTargetState, timeSeconds: number): IkPose {
  const breathingTarget: Vec3 = [
    state.target[0],
    state.target[1] + Math.sin(timeSeconds * 1.4) * 0.025,
    state.target[2]
  ];
  const result = solveTwoBoneIk({
    root: importedSkeletonFixture.root,
    mid: importedSkeletonFixture.mid,
    end: importedSkeletonFixture.end,
    target: breathingTarget,
    pole: state.pole,
    weight: state.weight,
    allowStretch: state.allowStretch
  });
  return {
    root: result.root,
    mid: result.mid,
    end: result.end,
    result
  };
}

export function targetFromCanvasPoint(canvas: HTMLCanvasElement, clientX: number, clientY: number): Vec3 {
  const rect = canvas.getBoundingClientRect();
  const x = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
  const y = 1 - ((clientY - rect.top) / Math.max(1, rect.height)) * 2;
  return [
    clamp(x * 1.28, -1.12, 1.18),
    clamp(0.88 + y * 0.86, 0.18, 1.62),
    0
  ];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
