/* PRD-06 T4.4 harness driver: runs the prd06-character-hero lane adapter for
 * ?engine=aura3d (default) or ?engine=three. The ReadyPayload publishes on
 * __PRD06_CHARACTER_HERO_READY__ / __PRD06_CHARACTER_HERO_READY_THREE__; the
 * live §17.2 frame probe lives on __PRD06_CHARACTER_HERO__ /
 * __PRD06_CHARACTER_HERO_THREE__ (status "done" once the 8 s sequence ends). */

// Buffer shim FIRST — transitive modules evaluate `Buffer` at load.
import "./buffer-shim.js";

type Runner = (host: HTMLElement, opts?: { variant?: string; dpr?: 1 | 2; qrFlags?: readonly string[] }) => Promise<unknown>;

export {};

declare global {
  interface Window {
    __PRD06_CHARACTER_HERO_HARNESS__?: { status: "importing" | "running" | "ok" | "error"; engine: string; error?: string };
    __PRD06_CHARACTER_HERO_READY__?: unknown;
    __PRD06_CHARACTER_HERO_READY_THREE__?: unknown;
  }
}

async function main(): Promise<void> {
  const engine = new URLSearchParams(location.search).get("engine") ?? "aura3d";
  const host = document.getElementById("stage");
  if (!host) throw new Error("missing #stage host");
  window.__PRD06_CHARACTER_HERO_HARNESS__ = { status: "importing", engine };
  try {
    const mod = engine === "three"
      ? await import("../../../../benchmarks/quality-rebuild/three/scenes/prd06/character-hero")
      : await import("../../../../benchmarks/quality-rebuild/aura3d/scenes/prd06/character-hero");
    const run = mod.default as Runner;
    window.__PRD06_CHARACTER_HERO_HARNESS__ = { status: "running", engine };
    const payload = await run(host, { qrFlags: engine === "aura3d" ? ["animation"] : [] });
    if (engine === "three") {
      window.__PRD06_CHARACTER_HERO_READY_THREE__ = payload;
    } else {
      window.__PRD06_CHARACTER_HERO_READY__ = payload;
    }
    window.__PRD06_CHARACTER_HERO_HARNESS__ = { status: "ok", engine };
  } catch (error) {
    const message = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
    window.__PRD06_CHARACTER_HERO_HARNESS__ = { status: "error", engine, error: message };
  }
}
void main();
