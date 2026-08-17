import { SKYLINE_LEVEL_ACTS } from "./level-layout";
import { resolveSkylineAct } from "./act-palette";

export interface SkylineHudSnapshot {
  readonly score: number;
  readonly coinCount: number;
  readonly emberStock: number;
  readonly deaths: number;
  readonly livesRemaining: number;
  readonly checkpointCount: number;
  readonly activatedCheckpointCount: number;
  readonly playerX: number;
  readonly actTitle: string;
  readonly objective: string;
  readonly paused: boolean;
}

export interface SkylineHudElements {
  readonly root: HTMLElement;
  readonly score: HTMLElement;
  readonly coins: HTMLElement;
  readonly ember: HTMLElement;
  readonly lives: HTMLElement;
  readonly actTitle: HTMLElement;
  readonly checkpointPips: HTMLElement;
  readonly objective: HTMLElement;
  readonly debugPanel: HTMLElement | null;
  readonly debugDistance: HTMLElement | null;
  readonly debugSurface: HTMLElement | null;
  readonly debugChallenge: HTMLElement | null;
}

export function isSkylineDebugMode(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("debug") === "1";
}

export function setupSkylineHud(panel: HTMLElement, checkpointCount: number): SkylineHudElements {
  const debug = isSkylineDebugMode();
  panel.setAttribute("aria-label", "Skyline Runner game HUD");
  panel.innerHTML = `
    <header class="runner-brand">
      <span class="label"><i aria-hidden="true"></i> Verdant relay</span>
      <h1>Skyline Runner</h1>
      <p class="claim">Bank lumen coins, stock ember charges, outrun the sentries, and light the summit beacon.</p>
    </header>
    <section class="panel-metrics game-hud" aria-label="Run status">
      <div class="metrics-row game-metrics">
        <article><span>Score</span><strong id="score-value">0</strong></article>
        <article><span>Coins</span><strong id="coin-value">0</strong></article>
        <article><span>Ember</span><strong id="ember-value">0</strong></article>
        <article class="metric--lives"><span>Lives</span><strong id="lives-value">3</strong></article>
        <article class="metric--act"><span>Act</span><strong id="act-title-value">${SKYLINE_LEVEL_ACTS[0]?.title ?? "Home Grove"}</strong></article>
      </div>
      <div class="checkpoint-row" aria-label="Relay checkpoints">
        <span class="checkpoint-label">Relays</span>
        <div id="checkpoint-pips" class="checkpoint-pips" data-total="${checkpointCount}"></div>
      </div>
      <div class="objective" id="objective-value">${SKYLINE_LEVEL_ACTS[0]?.objective ?? ""}</div>
    </section>
    ${debug ? `
    <section class="debug-panel" aria-label="Debug telemetry">
      <div class="debug-row"><span>Distance</span><strong id="x-value">0.00</strong></div>
      <div class="debug-row"><span>Surface</span><strong id="surface-value">—</strong></div>
      <div class="debug-row"><span>Flow</span><strong id="challenge-value">0</strong></div>
    </section>` : ""}
    <section class="runner-controls" aria-label="Runner controls">
      <h2>Traverse</h2>
      <div class="button-grid">
        <button id="left-control" type="button" aria-label="Move left"><b aria-hidden="true">←</b><span>Left</span></button>
        <button id="right-control" type="button" aria-label="Move right"><b aria-hidden="true">→</b><span>Right</span></button>
        <button id="jump-control" type="button"><b aria-hidden="true">↑</b><span>Jump</span></button>
        <button id="dash-control" type="button"><b aria-hidden="true">⇢</b><span>Dash</span></button>
        <button id="fire-control" type="button"><b aria-hidden="true">✸</b><span>Ember</span></button>
        <button id="reset-control" type="button"><b aria-hidden="true">↺</b><span>Reset</span></button>
      </div>
      <ul class="controls-list">
        <li><kbd>A D</kbd> Run</li>
        <li><kbd>Space</kbd> Jump</li>
        <li><kbd>Shift</kbd> Dash</li>
        <li><kbd>J</kbd> Ember</li>
        <li><kbd>P</kbd> Pause</li>
        <li><kbd>R</kbd> Reset</li>
      </ul>
    </section>`;

  const checkpointPips = requireElement("checkpoint-pips");
  checkpointPips.innerHTML = Array.from({ length: checkpointCount }, (_, index) =>
    `<span class="checkpoint-pip" data-index="${index + 1}" aria-hidden="true"></span>`
  ).join("");

  return {
    root: panel,
    score: requireElement("score-value"),
    coins: requireElement("coin-value"),
    ember: requireElement("ember-value"),
    lives: requireElement("lives-value"),
    actTitle: requireElement("act-title-value"),
    checkpointPips,
    objective: requireElement("objective-value"),
    debugPanel: debug ? panel.querySelector(".debug-panel") : null,
    debugDistance: debug ? requireElement("x-value") : null,
    debugSurface: debug ? requireElement("surface-value") : null,
    debugChallenge: debug ? requireElement("challenge-value") : null
  };
}

export function updateSkylineHud(
  hud: SkylineHudElements,
  snapshot: SkylineHudSnapshot,
  debugExtras?: { readonly surfaceLabel?: string; readonly flowLabel?: string }
): void {
  hud.score.textContent = String(snapshot.score);
  hud.coins.textContent = String(snapshot.coinCount);
  hud.ember.textContent = String(snapshot.emberStock);
  hud.lives.textContent = String(Math.max(0, snapshot.livesRemaining));
  hud.actTitle.textContent = snapshot.actTitle;
  hud.objective.textContent = snapshot.paused
    ? "Paused — press P to resume"
    : snapshot.objective;

  const pips = hud.checkpointPips.querySelectorAll<HTMLElement>(".checkpoint-pip");
  for (const pip of pips) {
    const index = Number(pip.dataset.index ?? 0);
    pip.classList.toggle("is-active", index <= snapshot.activatedCheckpointCount);
    pip.classList.toggle("is-current", index === snapshot.activatedCheckpointCount + 1);
  }

  if (hud.debugDistance && debugExtras) {
    hud.debugDistance.textContent = round(snapshot.playerX).toFixed(2);
  }
  if (hud.debugSurface && debugExtras?.surfaceLabel) {
    hud.debugSurface.textContent = debugExtras.surfaceLabel;
  }
  if (hud.debugChallenge && debugExtras?.flowLabel) {
    hud.debugChallenge.textContent = debugExtras.flowLabel;
  }

  hud.root.dataset.paused = snapshot.paused ? "true" : "false";
}

/** Returns true when the public layout exposes raw traversal x. */
export function publicSkylineHudShowsRawX(hud: SkylineHudElements): boolean {
  if (isSkylineDebugMode()) return Boolean(hud.debugDistance);
  return Boolean(document.getElementById("x-value"));
}

export function buildSkylineHudSnapshot(input: {
  readonly score: number;
  readonly coinCount: number;
  readonly emberStock: number;
  readonly deaths: number;
  readonly lives: number;
  readonly checkpointCount: number;
  readonly activatedCheckpointCount: number;
  readonly playerX: number;
  readonly objectiveMet: boolean;
  readonly paused: boolean;
}): SkylineHudSnapshot {
  const act = resolveSkylineAct(input.playerX);
  return {
    score: input.score,
    coinCount: input.coinCount,
    emberStock: input.emberStock,
    deaths: input.deaths,
    livesRemaining: Math.max(0, input.lives - input.deaths),
    checkpointCount: input.checkpointCount,
    activatedCheckpointCount: input.activatedCheckpointCount,
    playerX: input.playerX,
    actTitle: act.title,
    objective: input.objectiveMet ? "Summit beacon restored" : act.objective,
    paused: input.paused
  };
}

function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error("Missing element #" + id);
  return element;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
