export type AuraCinematicBackendPreference = "auto" | "webgl2" | "webgpu";
export type AuraCinematicRuntimeBackend = "webgl2" | "webgpu";

export interface AuraCinematicBackendAvailability {
  readonly webgl2?: boolean;
  readonly webgpu?: boolean;
}

export interface AuraCinematicBackendSelection {
  readonly backend: AuraCinematicRuntimeBackend;
  readonly requested: AuraCinematicBackendPreference;
  readonly fallbackUsed: boolean;
  readonly diagnostics: readonly string[];
}

export function selectAuraCinematicBackend(input: {
  readonly requested?: AuraCinematicBackendPreference;
  readonly availability?: AuraCinematicBackendAvailability;
} = {}): AuraCinematicBackendSelection {
  const requested = input.requested ?? "auto";
  const availability = input.availability ?? detectBackendAvailability();
  const webgl2 = availability.webgl2 !== false;
  const webgpu = availability.webgpu === true;
  if (requested === "webgpu" && webgpu) {
    return {
      backend: "webgpu",
      requested,
      fallbackUsed: false,
      diagnostics: ["WebGPU was explicitly selected and reported available."]
    };
  }
  if (requested === "webgpu" && !webgpu) {
    return {
      backend: "webgl2",
      requested,
      fallbackUsed: true,
      diagnostics: ["WebGPU was explicitly selected but unavailable; cinematic runtime fell back to WebGL2."]
    };
  }
  if (!webgl2 && webgpu) {
    return {
      backend: "webgpu",
      requested,
      fallbackUsed: requested !== "webgpu",
      diagnostics: ["WebGL2 was unavailable; WebGPU is used as the only reported production backend."]
    };
  }
  return {
    backend: "webgl2",
    requested,
    fallbackUsed: requested === "webgpu",
    diagnostics: [requested === "auto" ? "WebGL2 production runtime is the default cinematic backend." : "WebGL2 production runtime selected."]
  };
}

function detectBackendAvailability(): AuraCinematicBackendAvailability {
  const nav = globalThis.navigator as Navigator & { readonly gpu?: unknown } | undefined;
  return {
    webgl2: true,
    webgpu: Boolean(nav?.gpu)
  };
}
