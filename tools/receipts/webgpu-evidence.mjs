// Decides which WebGPU claim a piece of evidence can support. claims-and-boundaries.md section 7: "WebGPU claims
// include adapter, backend, dispatch, rendering and pixels", and section 6: software GL / software WebGPU proves
// correctness only, never "works on GPUs". The WebGPU audit rows (`tsl`, `compute`, WebGPU backend) stay
// `experimental` until a "real-gpu" classification exists for them in evidence/receipts.
//
//   evidence = {
//     adapter:  { isFallbackAdapter?, vendor?, architecture?, device?, description? },
//     backend:  "webgpu" | "webgl2" | ...,
//     dispatch: { workgroups: [x, y?, z?], readbackExact: boolean },   // compute evidence; optional for render-only claims
//     render:   { frames: number },
//     pixels:   { meanLuma: number, nonBlackRatio: number }
//   }
const SOFTWARE_ADAPTER = /swiftshader|llvmpipe|lavapipe|softpipe|basic render driver|microsoft basic|software|cpu/i;

export function isSoftwareAdapter(adapter) {
  if (!adapter || typeof adapter !== "object") return false;
  if (adapter.isFallbackAdapter === true) return true;
  return [adapter.vendor, adapter.architecture, adapter.device, adapter.description].some((value) => typeof value === "string" && SOFTWARE_ADAPTER.test(value));
}

/**
 * @param {object} evidence
 * @param {{ requireDispatch?: boolean }} [options] `requireDispatch: false` for a render-only claim (TSL materials).
 * @returns {{ claim: "none" | "software-webgpu" | "real-gpu", missing: string[] }}
 */
export function classifyWebGpuEvidence(evidence, { requireDispatch = true } = {}) {
  const missing = [];
  const adapter = evidence?.adapter;
  const hasAdapter = adapter !== null && typeof adapter === "object" && [adapter.vendor, adapter.architecture, adapter.device, adapter.description].some((value) => typeof value === "string" && value.length > 0);
  if (!hasAdapter) missing.push("adapter");
  if (evidence?.backend !== "webgpu") missing.push("backend");
  if (requireDispatch) {
    const dispatch = evidence?.dispatch;
    const workgroups = dispatch?.workgroups;
    const dispatched = Array.isArray(workgroups) && workgroups.length >= 1 && workgroups.every((n) => Number.isInteger(n) && n > 0);
    if (!dispatched || dispatch.readbackExact !== true) missing.push("dispatch");
  }
  if (!(evidence?.render?.frames >= 1)) missing.push("rendering");
  const pixels = evidence?.pixels;
  if (!(pixels?.nonBlackRatio > 0) || !(pixels?.meanLuma > 0)) missing.push("pixels");
  if (missing.length > 0) return { claim: "none", missing };
  return { claim: isSoftwareAdapter(adapter) ? "software-webgpu" : "real-gpu", missing };
}
