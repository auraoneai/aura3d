import type { IkTargetState } from "./ikTargets.js";

export type CurrentRoutesIkStatus = "loading" | "ready" | "running" | "error";

export interface CurrentRoutesSkinningIkRuntime {
  appId: "skinning-ik";
  status: CurrentRoutesIkStatus;
  statusLabel: string;
  frameCount: number;
  drawCalls: number;
  fps: number;
  elapsedMs: number;
  target: readonly [number, number, number];
  endEffector: readonly [number, number, number];
  endEffectorDistance: number;
  reached: boolean;
  stretched: boolean;
  poleInfluence: number;
  weight: number;
  skinningPalettesUpdated: number;
  motionSamples: number;
  motionTimeRange: number;
  poseDiversityScore: number;
  motionHealthy: boolean;
  width?: number;
  height?: number;
  skinName: string;
  jointNames: readonly string[];
  clipName: string;
  renderer: "a3d-webgl2";
  fixture: string;
  error?: string;
}

export function renderIkUi(root: HTMLElement, runtime: CurrentRoutesSkinningIkRuntime, state: IkTargetState): void {
  root.innerHTML = `
    <section class="panel">
      <h1>Robot Expressive IK</h1>
      <span class="status" data-state="${runtime.status}">${escapeHtml(runtime.statusLabel)}</span>
      <div class="grid">
        ${metric("Frames", runtime.frameCount)}
        ${metric("Draw calls", runtime.drawCalls)}
        ${metric("FPS", runtime.fps.toFixed(1))}
        ${metric("Distance", runtime.endEffectorDistance.toFixed(3))}
        ${metric("Reached", runtime.reached ? "yes" : "no")}
        ${metric("Pole", runtime.poleInfluence.toFixed(2))}
        ${metric("Palettes", runtime.skinningPalettesUpdated)}
        ${metric("Motion", runtime.motionHealthy ? "healthy" : "sampling")}
        ${metric("Pose", runtime.poseDiversityScore.toFixed(3))}
        ${metric("Render", runtime.width && runtime.height ? `${runtime.width}x${runtime.height}` : "pending")}
        ${metric("Clip", runtime.clipName)}
        ${metric("Fixture", runtime.fixture)}
        ${metric("Chain", runtime.jointNames.join(" > "))}
      </div>
      <label>
        IK weight ${state.weight.toFixed(2)}
        <input id="ik-weight" type="range" min="0" max="1" step="0.01" value="${state.weight}">
      </label>
      <label>
        Target X ${state.target[0].toFixed(2)}
        <input id="ik-target-x" type="range" min="-1.12" max="1.18" step="0.01" value="${state.target[0]}">
      </label>
      <label>
        Target Y ${state.target[1].toFixed(2)}
        <input id="ik-target-y" type="range" min="0.18" max="1.62" step="0.01" value="${state.target[1]}">
      </label>
      <label>
        <span><input id="ik-stretch" type="checkbox" ${state.allowStretch ? "checked" : ""}> Allow stretch</span>
      </label>
      <button id="ik-reset" type="button">Reset target</button>
      ${runtime.error ? `<pre>${escapeHtml(runtime.error)}</pre>` : ""}
    </section>
  `;
}

export function bindIkUi(root: HTMLElement, handlers: {
  setWeight(value: number): void;
  setTargetX(value: number): void;
  setTargetY(value: number): void;
  setAllowStretch(value: boolean): void;
  reset(): void;
}): void {
  root.querySelector<HTMLInputElement>("#ik-weight")?.addEventListener("input", (event) => {
    handlers.setWeight(Number((event.currentTarget as HTMLInputElement).value));
  });
  root.querySelector<HTMLInputElement>("#ik-target-x")?.addEventListener("input", (event) => {
    handlers.setTargetX(Number((event.currentTarget as HTMLInputElement).value));
  });
  root.querySelector<HTMLInputElement>("#ik-target-y")?.addEventListener("input", (event) => {
    handlers.setTargetY(Number((event.currentTarget as HTMLInputElement).value));
  });
  root.querySelector<HTMLInputElement>("#ik-stretch")?.addEventListener("change", (event) => {
    handlers.setAllowStretch((event.currentTarget as HTMLInputElement).checked);
  });
  root.querySelector<HTMLButtonElement>("#ik-reset")?.addEventListener("click", () => handlers.reset());
}

function metric(label: string, value: string | number): string {
  return `<div class="metric"><b>${escapeHtml(label)}</b><span>${escapeHtml(String(value))}</span></div>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
