import { computePerspectiveCameraFrame, type CameraFrameBounds } from "@galileo3d/rendering";
import { multiplyMat4, type Mat4, type Vec3 } from "@galileo3d/scene";

export type StereoMode = "side-by-side" | "anaglyph-preview";

export interface StereoControlState {
  readonly ipd: number;
  readonly convergence: number;
  readonly parallax: number;
  readonly mode: StereoMode;
}

export interface StereoEyeFrame {
  readonly eye: "left" | "right";
  readonly cameraPosition: Vec3;
  readonly viewMatrix: Mat4;
  readonly projectionMatrix: Mat4;
  readonly viewProjectionMatrix: Mat4;
}

export const DEFAULT_STEREO_CONTROLS: StereoControlState = {
  ipd: 0.15,
  convergence: 2.8,
  parallax: 0.46,
  mode: "side-by-side"
};

export function bindStereoControls(root: HTMLElement, onChange: (state: StereoControlState) => void): () => StereoControlState {
  let state = DEFAULT_STEREO_CONTROLS;
  const read = (): StereoControlState => state;
  root.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.id === "ipd") state = { ...state, ipd: Number(target.value) / 100 };
    if (target.id === "convergence") state = { ...state, convergence: Number(target.value) / 10 };
    if (target.id === "parallax") state = { ...state, parallax: Number(target.value) / 100 };
    onChange(state);
  });
  root.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    if (target.dataset.mode === "side-by-side" || target.dataset.mode === "anaglyph-preview") {
      state = { ...state, mode: target.dataset.mode };
      onChange(state);
    }
  });
  return read;
}

export function createStereoEyeFrames(
  bounds: CameraFrameBounds,
  viewport: { readonly width: number; readonly height: number },
  controls: StereoControlState
): readonly [StereoEyeFrame, StereoEyeFrame] {
  const base = computePerspectiveCameraFrame(bounds, viewport, {
    yawRadians: -0.42,
    pitchRadians: -0.12,
    paddingRatio: 0.12,
    fovYRadians: 0.64,
    nearPadding: 0.16,
    farPadding: 2.6
  });
  const lateral: Vec3 = [controls.ipd * 0.5, 0, 0];
  const yawOffset = Math.atan2(controls.ipd * controls.parallax, Math.max(0.1, controls.convergence));
  const leftView = yawMatrix(yawOffset);
  const rightView = yawMatrix(-yawOffset);
  return [
    {
      eye: "left",
      cameraPosition: [base.cameraPosition[0] - lateral[0], base.cameraPosition[1], base.cameraPosition[2]],
      viewMatrix: multiplyMat4(leftView, translateView(base.viewMatrix, lateral[0])),
      projectionMatrix: base.projectionMatrix,
      viewProjectionMatrix: multiplyMat4(base.projectionMatrix, multiplyMat4(leftView, translateView(base.viewMatrix, lateral[0])))
    },
    {
      eye: "right",
      cameraPosition: [base.cameraPosition[0] + lateral[0], base.cameraPosition[1], base.cameraPosition[2]],
      viewMatrix: multiplyMat4(rightView, translateView(base.viewMatrix, -lateral[0])),
      projectionMatrix: base.projectionMatrix,
      viewProjectionMatrix: multiplyMat4(base.projectionMatrix, multiplyMat4(rightView, translateView(base.viewMatrix, -lateral[0])))
    }
  ];
}

function translateView(matrix: Mat4, x: number): Mat4 {
  const translated = [...matrix] as Mat4;
  translated[12] += x;
  return translated;
}

function yawMatrix(angle: number): Mat4 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [
    c, 0, -s, 0,
    0, 1, 0, 0,
    s, 0, c, 0,
    0, 0, 0, 1
  ];
}
