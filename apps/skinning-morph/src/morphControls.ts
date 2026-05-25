import { type MorphTargetDelta } from "@galileo3d/rendering";
import type { Geometry } from "@galileo3d/rendering";

export interface MorphControlState {
  smile: number;
  blink: number;
  jaw: number;
  autoAnimate: boolean;
  speed: number;
}

export interface MorphEvaluation {
  weights: readonly [number, number, number];
  labels: readonly ["smile", "blink", "jaw"];
}

export function createMorphControlState(): MorphControlState {
  return {
    smile: 0.24,
    blink: 0,
    jaw: 0.18,
    autoAnimate: true,
    speed: 1
  };
}

export function evaluateMorphControls(state: MorphControlState, timeSeconds: number): MorphEvaluation {
  if (!state.autoAnimate) {
    return {
      labels: ["smile", "blink", "jaw"],
      weights: [state.smile, state.blink, state.jaw]
    };
  }
  const wave = Math.sin(timeSeconds * state.speed);
  const blink = Math.max(state.blink, Math.pow(Math.max(0, Math.sin(timeSeconds * state.speed * 3.1)), 18));
  return {
    labels: ["smile", "blink", "jaw"],
    weights: [
      clamp(state.smile + wave * 0.2, 0, 1),
      clamp(blink, 0, 1),
      clamp(state.jaw + Math.max(0, -wave) * 0.28, 0, 1)
    ]
  };
}

export function createFaceMorphTargets(face: Geometry): readonly MorphTargetDelta[] {
  const smilePositions: [number, number, number][] = [];
  const blinkPositions: [number, number, number][] = [];
  const jawPositions: [number, number, number][] = [];
  const vertices = face.vertexBuffer;
  for (let index = 0; index < vertices.vertexCount; index += 1) {
    const position = vertices.getAttribute(index, "position");
    const x = position[0] ?? 0;
    const y = position[1] ?? 0;
    const z = position[2] ?? 0;
    const cheek = smoothstep(0.12, 0.48, Math.abs(x)) * smoothstep(-0.22, 0.12, y) * (1 - smoothstep(0.18, 0.48, y));
    const lid = smoothstep(0.05, 0.34, Math.abs(x)) * smoothstep(0.18, 0.42, y) * (1 - smoothstep(0.42, 0.64, y));
    const jaw = smoothstep(-0.58, -0.16, -y) * (1 - smoothstep(0.28, 0.62, Math.abs(x)));
    smilePositions.push([Math.sign(x) * cheek * 0.045, cheek * 0.09, cheek * 0.035]);
    blinkPositions.push([0, -lid * 0.16, lid * 0.018]);
    jawPositions.push([0, -jaw * 0.18, -jaw * 0.025 + Math.max(0, -y) * 0.025]);
    if (z < -0.35) {
      smilePositions[index] = [0, 0, 0];
      blinkPositions[index] = [0, 0, 0];
      jawPositions[index] = [0, 0, 0];
    }
  }
  return [
    { positions: smilePositions },
    { positions: blinkPositions },
    { positions: jawPositions }
  ];
}

export function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / Math.max(1e-6, edge1 - edge0));
  return t * t * (3 - 2 * t);
}
