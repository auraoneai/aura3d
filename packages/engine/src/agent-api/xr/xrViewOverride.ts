import type { A3DXRViewLike } from "@aura3d/input";
import type { AuraXRViewCamera } from "./types.js";

const views = new WeakMap<object, AuraXRViewCamera>();

/** Install (or clear with `undefined`) the XR eye the next render on `key` (the app canvas) uses. */
export function setXRViewCamera(key: object, view: AuraXRViewCamera | undefined): void {
  if (view) views.set(key, view);
  else views.delete(key);
}

export function getXRViewCamera(key: object): AuraXRViewCamera | undefined {
  return views.get(key);
}

/**
 * The compiled frame's camera and source with the active XR eye applied. With
 * no eye installed the input passes through untouched, so non-XR frames are
 * unaffected. The renderer takes the eye position from `source.cameraPosition`
 * (specular, LOD, shadows) and the matrices from `camera`.
 */
export function applyXRViewOverride<S extends object, C extends object | undefined>(
  key: object,
  input: { readonly source: S; readonly camera?: C }
): { readonly source: S; readonly camera: C | object | undefined } {
  const view = views.get(key);
  if (!view) return { source: input.source, camera: input.camera };
  const layerMask = (input.camera as { readonly layerMask?: number } | undefined)?.layerMask;
  return {
    source: { ...input.source, cameraPosition: view.eyePosition },
    camera: {
      viewMatrix: view.viewMatrix,
      projectionMatrix: view.projectionMatrix,
      viewProjectionMatrix: view.viewProjectionMatrix,
      ...(layerMask !== undefined ? { layerMask } : {})
    }
  };
}

/** A finite 16-number column-major matrix, or null. */
export function readMatrix4(value: readonly number[] | undefined): number[] | null {
  if (!value || value.length < 16) return null;
  const out: number[] = [];
  for (let i = 0; i < 16; i += 1) {
    const entry = value[i];
    if (typeof entry !== "number" || !Number.isFinite(entry)) return null;
    out.push(entry);
  }
  return out;
}

/** `a * b`, column-major. */
export function multiplyMatrix4(a: readonly number[], b: readonly number[]): number[] {
  const out = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c += 1) {
    for (let r = 0; r < 4; r += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += a[k * 4 + r]! * b[c * 4 + k]!;
      out[c * 4 + r] = sum;
    }
  }
  return out;
}

/** Inverse of a rigid transform (rotation + translation only), column-major. */
export function invertRigidMatrix4(m: readonly number[]): number[] {
  const o = new Array<number>(16).fill(0);
  o[0] = m[0]!; o[1] = m[4]!; o[2] = m[8]!;
  o[4] = m[1]!; o[5] = m[5]!; o[6] = m[9]!;
  o[8] = m[2]!; o[9] = m[6]!; o[10] = m[10]!;
  o[12] = -(o[0]! * m[12]! + o[4]! * m[13]! + o[8]! * m[14]!);
  o[13] = -(o[1]! * m[12]! + o[5]! * m[13]! + o[9]! * m[14]!);
  o[14] = -(o[2]! * m[12]! + o[6]! * m[13]! + o[10]! * m[14]!);
  o[15] = 1;
  return o;
}

/**
 * Resolve one `XRView` into the camera the renderer consumes, or null when its
 * matrices are missing or non-finite (the eye is then skipped, never warped).
 */
export function resolveXRView(
  view: A3DXRViewLike,
  viewport: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
): AuraXRViewCamera | null {
  const projection = readMatrix4(view.projectionMatrix);
  if (!projection) return null;
  const viewToWorld = readMatrix4(view.transform?.matrix);
  const viewMatrix = readMatrix4(view.transform?.inverse?.matrix) ?? (viewToWorld ? invertRigidMatrix4(viewToWorld) : null);
  if (!viewMatrix) return null;
  const eyeSource = viewToWorld ?? invertRigidMatrix4(viewMatrix);
  return {
    eye: view.eye ?? "none",
    viewMatrix,
    projectionMatrix: projection,
    viewProjectionMatrix: multiplyMatrix4(projection, viewMatrix),
    eyePosition: [eyeSource[12]!, eyeSource[13]!, eyeSource[14]!],
    viewport
  };
}
