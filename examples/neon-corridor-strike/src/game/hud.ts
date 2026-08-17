import { ENEMIES } from "./enemies";
import { fireBus } from "./fire-bus";
import { MAG_SIZE, type FpsRunState } from "./state";

export function createHud(): HTMLElement {
  const root = document.createElement("aside");
  root.id = "fps-hud";
  root.style.cssText = [
    "position:absolute",
    "inset:0",
    "z-index:6",
    "pointer-events:none",
    "font:600 13px/1.35 ui-sans-serif,system-ui,sans-serif",
    "color:#e8f4ff"
  ].join(";");
  root.innerHTML = `
    <div style="position:absolute;left:16px;top:16px;min-width:260px;padding:12px;border-radius:8px;background:rgba(4,8,14,.78);border:1px solid rgba(80,220,255,.28)">
      <strong>Neon Corridor Strike</strong>
      <div data-hud="status"></div>
      <div data-hud="vitals"></div>
      <div data-hud="objective"></div>
      <div data-hud="warn" style="color:#ffb020"></div>
      <div style="opacity:.75;margin-top:8px">J or F fire · WASD move · R reload · T reset · mouse optional for look</div>
    </div>
    <button data-hud="fire" type="button" style="position:absolute;right:24px;bottom:24px;pointer-events:auto;padding:14px 22px;border-radius:10px;border:1px solid rgba(80,220,255,.5);background:rgba(4,8,14,.92);color:#e8f4ff;font:700 16px/1 ui-sans-serif,system-ui,sans-serif;cursor:pointer">FIRE (J)</button>
    <div data-hud="start" style="position:absolute;left:16px;bottom:24px;padding:10px 14px;border-radius:8px;background:rgba(4,8,14,.88);border:1px solid rgba(80,220,255,.35);font-size:14px">J fires · WASD moves</div>
    <div data-hud="crosshair" style="position:absolute;left:50%;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;border:2px solid rgba(233,247,255,.85);border-radius:50%"></div>
    <div data-hud="banner" style="position:absolute;left:50%;top:26%;transform:translateX(-50%);padding:14px 22px;border-radius:10px;background:rgba(4,8,14,.88);border:1px solid rgba(80,220,255,.4);font-size:22px;letter-spacing:.04em;display:none"></div>
  `;
  document.body.append(root);
  const fire = root.querySelector("[data-hud=\"fire\"]");
  if (fire instanceof HTMLButtonElement) {
    fire.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      fireBus().queued = true;
      fireBus().held = true;
      window.__AURA3D_FPS_SHOOT__?.();
    });
    fire.addEventListener("pointerup", () => {
      fireBus().held = false;
    });
    fire.addEventListener("pointerleave", () => {
      fireBus().held = false;
    });
  }
  return root;
}

export function renderHud(root: HTMLElement, state: FpsRunState): void {
  const remaining = ENEMIES.length - state.killed.length;
  set(root, "status", `${state.status}${state.paused ? " · paused" : ""} · score ${state.score}`);
  set(root, "vitals", `HP ${Math.round(state.hp)} · ammo ${state.ammo}/${MAG_SIZE} · reserve ${state.reserve} · hostiles ${remaining}`);
  set(root, "objective", state.objective);
  set(root, "warn", state.status === "playing" && state.ammo === 0 ? "Press R to reload" : state.status === "playing" && state.ammo <= 3 ? "LOW AMMO" : "");
  const start = root.querySelector("[data-hud=\"start\"]");
  if (start instanceof HTMLElement) start.style.display = state.shotsFired > 0 ? "none" : "block";
  const banner = root.querySelector("[data-hud=\"banner\"]");
  if (banner instanceof HTMLElement) {
    const text = state.status === "won" ? "CLEARED — Press R to reset" : state.status === "lost" ? "DOWN — Press R to reset" : "";
    banner.textContent = text;
    banner.style.display = text ? "block" : "none";
  }
}

function set(root: HTMLElement, key: string, text: string): void {
  const node = root.querySelector(`[data-hud="${key}"]`);
  if (node) node.textContent = text;
}
