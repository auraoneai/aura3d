import type { CurrentRoutesAnimationKeyframesRuntime, CurrentRoutesKeyframeControls } from "./state.js";

export interface CurrentRoutesKeyframeUiOptions {
  readonly runtime: CurrentRoutesAnimationKeyframesRuntime;
  readonly clips: readonly string[];
  readonly onControls: (controls: CurrentRoutesKeyframeControls) => void;
}

export function renderKeyframeUi(root: HTMLElement, options: CurrentRoutesKeyframeUiOptions): void {
  const { runtime, clips } = options;
  root.innerHTML = `
    <section class="panel">
      <div class="header">
        <h1>CurrentRoutes Animation Keyframes</h1>
        <span class="status ${runtime.status}">${escapeHtml(runtime.status)}</span>
      </div>
      <div class="metrics">
        ${metric("clip", runtime.clipName)}
        ${metric("frames", String(runtime.frameCount))}
        ${metric("draw calls", String(runtime.drawCalls))}
        ${metric("fps", runtime.fps.toFixed(1))}
        ${metric("time", `${runtime.animationTime.toFixed(2)}s`)}
        ${metric("tracks", String(runtime.tracksApplied))}
        ${metric("motion", runtime.motionHealthy ? "healthy" : "sampling")}
        ${metric("pose", runtime.poseDiversityScore.toFixed(3))}
      </div>
      <div class="controls">
        <button id="play-toggle" type="button" ${runtime.status === "error" ? "disabled" : ""}>${runtime.controls.playing ? "Pause" : "Play"}</button>
        <label>Clip
          <select id="clip-select">
            ${clips.map((clip) => `<option value="${escapeAttr(clip)}" ${clip === runtime.controls.clipName ? "selected" : ""}>${escapeHtml(clip)}</option>`).join("")}
          </select>
        </label>
        <label>Speed ${runtime.controls.speed.toFixed(2)}x
          <input id="speed-range" type="range" min="0" max="2" step="0.05" value="${runtime.controls.speed}">
        </label>
        <label>Scrub ${Math.round(runtime.controls.scrub * 100)}%
          <input id="scrub-range" type="range" min="0" max="1" step="0.001" value="${runtime.controls.scrub}">
        </label>
        <label>Camera Orbit
          <input id="orbit-range" type="range" min="-1.4" max="1.1" step="0.01" value="${runtime.controls.orbitYaw}">
        </label>
      </div>
      <p class="details">${escapeHtml(runtime.loadingStep)}</p>
      ${runtime.error ? `<pre class="error">${escapeHtml(runtime.error)}</pre>` : ""}
    </section>
  `;

  bind(root, options);
}

function bind(root: HTMLElement, options: CurrentRoutesKeyframeUiOptions): void {
  const controls = options.runtime.controls;
  root.querySelector("#play-toggle")?.addEventListener("click", () => {
    options.onControls({ ...controls, playing: !controls.playing });
  });
  root.querySelector("#clip-select")?.addEventListener("change", (event) => {
    const value = event.target instanceof HTMLSelectElement ? event.target.value : controls.clipName;
    options.onControls({ ...controls, clipName: value, scrub: 0 });
  });
  root.querySelector("#speed-range")?.addEventListener("input", (event) => {
    const value = event.target instanceof HTMLInputElement ? Number(event.target.value) : controls.speed;
    options.onControls({ ...controls, speed: value });
  });
  root.querySelector("#scrub-range")?.addEventListener("input", (event) => {
    const value = event.target instanceof HTMLInputElement ? Number(event.target.value) : controls.scrub;
    options.onControls({ ...controls, scrub: value, playing: false });
  });
  root.querySelector("#orbit-range")?.addEventListener("input", (event) => {
    const value = event.target instanceof HTMLInputElement ? Number(event.target.value) : controls.orbitYaw;
    options.onControls({ ...controls, orbitYaw: value });
  });
}

function metric(label: string, value: string): string {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}
