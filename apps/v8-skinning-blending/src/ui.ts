import type { SkinningBlendControls, BlendWeights } from "./blendController.js";

export interface SkinningBlendingRuntime {
  readonly appId: "v8-skinning-blending";
  readonly status: "loading" | "ready" | "running" | "error";
  readonly loadingStep: string;
  readonly error?: string;
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly fps: number;
  readonly animationTime: number;
  readonly clipWeights: BlendWeights;
  readonly tracksApplied: number;
  readonly skinningPalettesUpdated: number;
  readonly motionSamples: number;
  readonly motionTimeRange: number;
  readonly poseDiversityScore: number;
  readonly motionHealthy: boolean;
  readonly controls: SkinningBlendControls;
}

export function renderSkinningBlendingUi(
  root: HTMLElement,
  runtime: SkinningBlendingRuntime,
  onControls: (controls: SkinningBlendControls) => void
): void {
  root.innerHTML = `
    <section class="panel">
      <div class="header">
        <h1>V8 Skinning Blending</h1>
        <span class="status ${runtime.status}">${runtime.status}</span>
      </div>
      <div class="metrics">
        ${metric("frames", String(runtime.frameCount))}
        ${metric("draw calls", String(runtime.drawCalls))}
        ${metric("fps", runtime.fps.toFixed(1))}
        ${metric("time", `${runtime.animationTime.toFixed(2)}s`)}
        ${metric("tracks", String(runtime.tracksApplied))}
        ${metric("palettes", String(runtime.skinningPalettesUpdated))}
        ${metric("motion", runtime.motionHealthy ? "healthy" : "sampling")}
        ${metric("pose", runtime.poseDiversityScore.toFixed(3))}
      </div>
      <div class="controls">
        <button id="play-toggle" type="button">${runtime.controls.playing ? "Pause" : "Play"}</button>
        <label>Idle ${runtime.controls.weights.idle.toFixed(2)}
          <input id="idle-weight" type="range" min="0" max="1" step="0.01" value="${runtime.controls.weights.idle}">
        </label>
        <label>Walk ${runtime.controls.weights.walk.toFixed(2)}
          <input id="walk-weight" type="range" min="0" max="1" step="0.01" value="${runtime.controls.weights.walk}">
        </label>
        <label>Run ${runtime.controls.weights.run.toFixed(2)}
          <input id="run-weight" type="range" min="0" max="1" step="0.01" value="${runtime.controls.weights.run}">
        </label>
        <label>Speed ${runtime.controls.speed.toFixed(2)}x
          <input id="speed-range" type="range" min="0" max="2" step="0.05" value="${runtime.controls.speed}">
        </label>
        <label>Camera Orbit
          <input id="orbit-range" type="range" min="-1.4" max="1.1" step="0.01" value="${runtime.controls.orbitYaw}">
        </label>
      </div>
      <div class="weights">
        ${bar("idle", runtime.clipWeights.idle)}
        ${bar("walk", runtime.clipWeights.walk)}
        ${bar("run", runtime.clipWeights.run)}
      </div>
      <p class="details">${escapeHtml(runtime.loadingStep)}</p>
      ${runtime.error ? `<pre>${escapeHtml(runtime.error)}</pre>` : ""}
    </section>
  `;
  bind(root, runtime.controls, onControls);
}

function bind(root: HTMLElement, controls: SkinningBlendControls, onControls: (controls: SkinningBlendControls) => void): void {
  root.querySelector("#play-toggle")?.addEventListener("click", () => onControls({ ...controls, playing: !controls.playing }));
  bindRange(root, "#idle-weight", (value) => onControls({ ...controls, weights: { ...controls.weights, idle: value } }));
  bindRange(root, "#walk-weight", (value) => onControls({ ...controls, weights: { ...controls.weights, walk: value } }));
  bindRange(root, "#run-weight", (value) => onControls({ ...controls, weights: { ...controls.weights, run: value } }));
  bindRange(root, "#speed-range", (value) => onControls({ ...controls, speed: value }));
  bindRange(root, "#orbit-range", (value) => onControls({ ...controls, orbitYaw: value }));
}

function bindRange(root: HTMLElement, selector: string, handler: (value: number) => void): void {
  root.querySelector(selector)?.addEventListener("input", (event) => {
    if (event.target instanceof HTMLInputElement) handler(Number(event.target.value));
  });
}

function metric(label: string, value: string): string {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function bar(label: string, value: number): string {
  return `<div><span>${escapeHtml(label)} ${value.toFixed(2)}</span><div class="bar"><i style="width:${Math.round(value * 100)}%"></i></div></div>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
