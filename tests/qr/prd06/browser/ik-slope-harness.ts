/* PRD-06 T3.9 harness driver: runs the prd06-ik-slope lane adapter for
 * ?engine=aura3d (default) or ?engine=three against the shared spec and
 * publishes the ReadyPayload on __PRD06_IK_SLOPE__ / __PRD06_IK_SLOPE_THREE__.
 * The scene's foot-IK metric rides ReadyPayload.extra.footIk on both engines
 * (aura: footPlanting evidence; three: CCDIKSolver residual). */

// Buffer shim FIRST — transitive modules evaluate `Buffer` at load.
import "./buffer-shim.js";

type Runner = (host: HTMLElement, opts?: { variant?: string; dpr?: 1 | 2; qrFlags?: readonly string[] }) => Promise<unknown>;

export {};

declare global {
  interface Window {
    __PRD06_IK_SLOPE_HARNESS__?: { status: "importing" | "running" | "ok" | "error"; engine: string; error?: string };
    __PRD06_IK_SLOPE__?: unknown;
    __PRD06_IK_SLOPE_THREE__?: unknown;
  }
}

async function main(): Promise<void> {
  const engine = new URLSearchParams(location.search).get("engine") ?? "aura3d";
  const host = document.getElementById("stage");
  if (!host) throw new Error("missing #stage host");
  window.__PRD06_IK_SLOPE_HARNESS__ = { status: "importing", engine };
  try {
    const mod = engine === "three"
      ? await import("../../../../benchmarks/quality-rebuild/three/scenes/prd06/ik-slope")
      : await import("../../../../benchmarks/quality-rebuild/aura3d/scenes/prd06/ik-slope");
    const run = mod.default as Runner;
    window.__PRD06_IK_SLOPE_HARNESS__ = { status: "running", engine };
    const payload = await run(host, { qrFlags: engine === "aura3d" ? ["animation"] : [] });
    if (engine === "three") {
      window.__PRD06_IK_SLOPE_THREE__ = payload;
    } else {
      window.__PRD06_IK_SLOPE__ = payload;
    }
    window.__PRD06_IK_SLOPE_HARNESS__ = { status: "ok", engine };
  } catch (error) {
    const message = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
    window.__PRD06_IK_SLOPE_HARNESS__ = { status: "error", engine, error: message };
  }
}
void main();
