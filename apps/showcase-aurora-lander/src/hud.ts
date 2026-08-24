/**
 * DOM HUD for Aurora Lander — altitude, velocity, fuel, attitude, grade banners.
 *
 * The HUD is UI only. Every world claim (terrain contact, descent motion, dust)
 * is proven by Aura3D-rendered pixels and runtime telemetry elsewhere; this module
 * just keeps the player informed and exposes stable ids the browser specs read.
 */
import { HARD_TOUCHDOWN_MAX_VSPEED } from "./touchdown";

export interface HudBindings {
  readonly siteName: HTMLElement;
  readonly altitude: HTMLElement;
  readonly vspeed: HTMLElement;
  readonly hspeed: HTMLElement;
  readonly attitude: HTMLElement;
  readonly fuelFill: HTMLElement;
  readonly fuelLabel: HTMLElement;
  readonly hull: HTMLElement;
  readonly score: HTMLElement;
  readonly banner: HTMLElement;
  readonly gustFlag: HTMLElement;
  readonly ghostFlag: HTMLElement;
}

export function bindHud(root: HTMLElement | null): HudBindings {
  if (!root) throw new Error("Aurora Lander HUD root #hud is missing.");
  root.innerHTML = `
    <div class="hud-row">
      <div class="hud-chip" data-testid="hud-site"><span class="label">SITE</span><span id="hud-site-name">1</span></div>
      <div class="hud-chip" data-testid="hud-score"><span class="label">SCORE</span><span id="hud-score">0</span></div>
    </div>
    <div class="hud-row">
      <div class="hud-chip" data-testid="hud-altitude"><span class="label">ALT</span><span id="hud-altitude">120.0 m</span></div>
      <div class="hud-chip" data-testid="hud-vspeed"><span class="label">V/S</span><span id="hud-vspeed">0.0</span></div>
      <div class="hud-chip" data-testid="hud-hspeed"><span class="label">H/S</span><span id="hud-hspeed">0.0</span></div>
      <div class="hud-chip" data-testid="hud-attitude"><span class="label">ATT</span><span id="hud-attitude">0°</span></div>
    </div>
    <div class="hud-row">
      <div class="hud-chip" data-testid="hud-fuel">
        <span class="label">FUEL</span>
        <span class="fuel-track"><span class="fuel-fill" id="hud-fuel-fill" style="width:100%"></span></span>
        <span id="hud-fuel-label">100%</span>
      </div>
      <div class="hud-chip" data-testid="hud-hull"><span class="label">HULL</span><span id="hud-hull">100%</span></div>
      <div class="hud-chip" id="hud-ghost-flag" data-testid="hud-ghost" hidden>GHOST</div>
      <div class="hud-chip gust-flag" id="hud-gust-flag" data-testid="hud-gust" hidden>GUST INBOUND</div>
    </div>
    <div class="hud-row">
      <div class="banner" id="hud-banner" data-testid="hud-banner" hidden></div>
    </div>
  `;
  return {
    siteName: requireElement(root, "hud-site-name"),
    altitude: requireElement(root, "hud-altitude"),
    vspeed: requireElement(root, "hud-vspeed"),
    hspeed: requireElement(root, "hud-hspeed"),
    attitude: requireElement(root, "hud-attitude"),
    fuelFill: requireElement(root, "hud-fuel-fill"),
    fuelLabel: requireElement(root, "hud-fuel-label"),
    hull: requireElement(root, "hud-hull"),
    score: requireElement(root, "hud-score"),
    banner: requireElement(root, "hud-banner"),
    gustFlag: requireElement(root, "hud-gust-flag"),
    ghostFlag: requireElement(root, "hud-ghost-flag")
  };
}

function requireElement(root: HTMLElement, id: string): HTMLElement {
  const element = root.querySelector("#" + id);
  if (!element) throw new Error("Aurora Lander HUD element missing: #" + id);
  return element as HTMLElement;
}

export interface HudFrameState {
  readonly siteLabel: string;
  readonly altitudeMeters: number;
  readonly vspeed: number;
  readonly hspeed: number;
  readonly attitudeDeg: number;
  readonly fuelFraction: number;
  readonly hullFraction: number;
  readonly score: number;
  readonly gustTelegraph: boolean;
  readonly ghostActive: boolean;
}

const round = (value: number, digits = 1): number => {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
};

export function updateHud(bindings: HudBindings, state: HudFrameState): void {
  bindings.siteName.textContent = state.siteLabel;
  bindings.altitude.textContent = `${round(Math.max(0, state.altitudeMeters))} m`;
  // Vertical speed reads signed: negative while descending (classic altimeter feel).
  bindings.vspeed.textContent = round(state.vspeed).toFixed(1);
  bindings.vspeed.classList.toggle("warn", state.vspeed < -HARD_TOUCHDOWN_MAX_VSPEED);
  bindings.hspeed.textContent = round(state.hspeed).toFixed(1);
  bindings.attitude.textContent = `${round(state.attitudeDeg)}°`;
  bindings.attitude.classList.toggle("warn", state.attitudeDeg > 12);
  const fraction = Math.max(0, Math.min(1, state.fuelFraction));
  bindings.fuelFill.style.width = `${Math.round(fraction * 100)}%`;
  bindings.fuelLabel.textContent = `${Math.round(fraction * 100)}%`;
  bindings.hull.textContent = `${Math.round(Math.max(0, Math.min(1, state.hullFraction)) * 100)}%`;
  bindings.hull.classList.toggle("warn", state.hullFraction <= 0.4);
  bindings.score.textContent = String(Math.round(state.score));
  bindings.gustFlag.hidden = !state.gustTelegraph;
  bindings.ghostFlag.hidden = !state.ghostActive;
}

export type BannerKind = "grade-soft" | "grade-hard" | "grade-crash" | "site-clear" | null;

/** Show a grade/clear banner; pass null to hide. */
export function showBanner(bindings: HudBindings, kind: BannerKind, text: string): void {
  if (kind === null) {
    bindings.banner.hidden = true;
    bindings.banner.className = "banner";
    return;
  }
  bindings.banner.hidden = false;
  bindings.banner.className = `banner ${kind}`;
  bindings.banner.textContent = text;
}
