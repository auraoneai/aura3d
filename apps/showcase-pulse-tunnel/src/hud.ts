/**
 * Pulse Tunnel HUD — shields, style meter, distance, section name, sync badge.
 *
 * DOM is UI only: every gameplay number here mirrors the same values published to
 * window.__PULSE_TUNNEL_EVIDENCE__ each frame, and the sync badge (debug) reads the
 * beat clock sample directly. Touch controls are real buttons that dispatch synthetic
 * keyboard codes through bindGameTouchControls so input has exactly one path.
 */
import { bindGameTouchControls } from "@aura3d/engine";

export interface PulseHudElements {
  readonly shields: HTMLElement;
  readonly combatState: HTMLElement;
  readonly styleLabel: HTMLElement;
  readonly styleBar: HTMLElement;
  readonly distance: HTMLElement;
  readonly section: HTMLElement;
  readonly stateBanner: HTMLElement;
  readonly score: HTMLElement;
  readonly syncBadge: HTMLElement;
}

export interface PulseHudSnapshot {
  readonly shields: number;
  readonly multiplier: number;
  readonly styleHeat: number;
  readonly score: number;
  readonly distanceMeters: number;
  readonly sectionId: string;
  readonly combatState: string;
  readonly state: string;
  readonly message: string;
  readonly debug: boolean;
  readonly syncMode: string;
  readonly driftMs: number;
}

export function isPulseDebugMode(): boolean {
  if (typeof window === "undefined") return false;
  return /(?:^|[/\?])debug=1(?:&|$)/.test(window.location.search) || window.location.search.includes("debug=1");
}

export function setupPulseHud(panel: HTMLElement | null): PulseHudElements | null {
  if (!panel) return null;
  panel.innerHTML = `
    <div class="pulse-hud" data-testid="pulse-hud">
      <div class="pulse-mission" aria-hidden="true">
        <span class="pulse-mission-kicker">FINAL BEAT</span>
        <strong>BREAK THE SENTINEL</strong>
        <span id="pulse-combat-state" class="pulse-combat-state">APPROACH // NEXT GATE</span>
      </div>
      <div class="pulse-row pulse-shields" id="pulse-shields" aria-label="Shields"></div>
      <div class="pulse-row">
        <span class="pulse-label">Style</span>
        <span id="pulse-style-label" class="pulse-value">x1.0</span>
        <span class="pulse-meter"><span id="pulse-style-bar" class="pulse-meter-fill"></span></span>
      </div>
      <div class="pulse-row">
        <span class="pulse-label">Distance</span>
        <span id="pulse-distance" class="pulse-value">0 m</span>
      </div>
      <div class="pulse-row">
        <span class="pulse-label">Score</span>
        <span id="pulse-score" class="pulse-value">0</span>
      </div>
      <div class="pulse-row">
        <span class="pulse-label">Section</span>
        <span id="pulse-section" class="pulse-value pulse-section-name">intro</span>
      </div>
      <div class="pulse-state" id="pulse-state-banner" role="status"></div>
      <button id="pulse-reset-control" class="pulse-touch pulse-touch-wide" type="button">Restart (R)</button>
      <div class="pulse-sync-badge" id="pulse-sync-badge" hidden></div>
    </div>
    <div class="pulse-touch-pad" aria-label="Touch controls">
      <div class="pulse-touch-column">
        <button id="pulse-left-control" class="pulse-touch" type="button" aria-label="Lane left">&#9664;</button>
        <button id="pulse-right-control" class="pulse-touch" type="button" aria-label="Lane right">&#9654;</button>
      </div>
      <div class="pulse-touch-column">
        <button id="pulse-jump-control" class="pulse-touch" type="button" aria-label="Jump">Jump</button>
        <button id="pulse-slide-control" class="pulse-touch" type="button" aria-label="Slide">Slide</button>
      </div>
    </div>
  `;
  const require = (id: string): HTMLElement => {
    const element = panel.querySelector(`#${id}`);
    if (!element) throw new Error(`Pulse HUD element missing: ${id}`);
    return element as HTMLElement;
  };
  // Touch buttons dispatch the SAME keyboard codes the game.input map owns.
  bindGameTouchControls({
    hold: [
      { elementId: "pulse-left-control", code: "KeyA" },
      { elementId: "pulse-right-control", code: "KeyD" }
    ],
    pulse: [
      { elementId: "pulse-jump-control", code: "KeyW" },
      { elementId: "pulse-slide-control", code: "KeyS" },
      { elementId: "pulse-reset-control", code: "KeyR" }
    ]
  });
  return {
    shields: require("pulse-shields"),
    combatState: require("pulse-combat-state"),
    styleLabel: require("pulse-style-label"),
    styleBar: require("pulse-style-bar"),
    distance: require("pulse-distance"),
    section: require("pulse-section"),
    stateBanner: require("pulse-state-banner"),
    score: require("pulse-score"),
    syncBadge: require("pulse-sync-badge")
  };
}

export function updatePulseHud(elements: PulseHudElements | null, snapshot: PulseHudSnapshot): void {
  if (!elements) return;
  elements.shields.textContent = "";
  for (let index = 0; index < 3; index += 1) {
    const pip = document.createElement("span");
    pip.className = index < snapshot.shields ? "pulse-pip pulse-pip-live" : "pulse-pip pulse-pip-lost";
    elements.shields.appendChild(pip);
  }
  elements.combatState.textContent = snapshot.combatState;
  elements.styleLabel.textContent = `x${snapshot.multiplier.toFixed(1)}`;
  elements.styleBar.style.width = `${Math.round((snapshot.styleHeat / 3) * 100)}%`;
  elements.distance.textContent = `${Math.round(snapshot.distanceMeters)} m`;
  elements.score.textContent = Math.round(snapshot.score).toLocaleString("en-US");
  elements.section.textContent = snapshot.sectionId;
  elements.stateBanner.textContent = snapshot.message;
  elements.stateBanner.dataset.state = snapshot.state;
  elements.stateBanner.hidden = snapshot.state === "running";
  if (snapshot.debug) {
    elements.syncBadge.hidden = false;
    elements.syncBadge.textContent =
      `sync:${snapshot.syncMode} drift:${snapshot.driftMs >= 0 ? "+" : ""}${snapshot.driftMs.toFixed(0)}ms`;
    elements.syncBadge.dataset.mode = snapshot.syncMode;
  } else {
    elements.syncBadge.hidden = true;
  }
}
