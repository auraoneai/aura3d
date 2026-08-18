import { ENEMIES } from "./enemies";
import { fireBus } from "./fire-bus";
import { MAG_SIZE, MAX_HP, type FpsRunState } from "./state";
import { RELOAD_TIME } from "./weapons";

const cache = new Map<string, string>();

export function createHud(): HTMLElement {
  const root = document.createElement("aside");
  root.id = "fps-hud";
  root.style.cssText = [
    "position:absolute",
    "inset:0",
    "z-index:6",
    "pointer-events:none",
    "font:600 13px/1.35 ui-sans-serif,system-ui,sans-serif",
    "color:#e8f4ff",
    "text-shadow:0 1px 2px rgba(0,0,0,.65)"
  ].join(";");
  root.innerHTML = `
    <div data-hud="vignette" style="position:absolute;inset:0;opacity:0;transition:opacity .18s ease;box-shadow:inset 0 0 120px 42px rgba(255,42,32,.55)"></div>
    <div style="position:absolute;left:16px;top:14px;min-width:250px;max-width:320px;padding:10px 14px;border-radius:10px;background:rgba(4,8,14,.66);border:1px solid rgba(80,220,255,.22);backdrop-filter:blur(3px)">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px">
        <strong style="letter-spacing:.08em;font-size:12px;color:#7ef8ff">NEON CORRIDOR STRIKE</strong>
        <span data-hud="score" style="font-size:12px;color:#ffb020"></span>
      </div>
      <div data-hud="objective" style="margin-top:4px;font-size:12.5px"></div>
      <div data-hud="hostiles" style="display:flex;gap:6px;margin-top:8px"></div>
      <div data-hud="status" style="margin-top:6px;font-size:11px;opacity:.8"></div>
    </div>
    <div style="position:absolute;left:16px;bottom:20px;padding:10px 14px;border-radius:10px;background:rgba(4,8,14,.66);border:1px solid rgba(80,220,255,.22);min-width:210px">
      <div style="display:flex;align-items:baseline;gap:8px">
        <span style="font-size:11px;letter-spacing:.1em;opacity:.75">INTEGRITY</span>
        <span data-hud="hp" style="font-size:20px;font-weight:800"></span>
      </div>
      <div style="margin-top:5px;height:8px;border-radius:4px;background:rgba(233,247,255,.14);overflow:hidden">
        <div data-hud="hp-fill" style="height:100%;width:100%;border-radius:4px;background:#3dffb0;transition:width .12s ease,background .2s ease"></div>
      </div>
      <div data-hud="warn" style="margin-top:6px;font-size:11.5px;color:#ffb020;min-height:14px"></div>
    </div>
    <div style="position:absolute;right:24px;bottom:86px;padding:10px 14px;border-radius:10px;background:rgba(4,8,14,.66);border:1px solid rgba(80,220,255,.22);text-align:right;min-width:190px">
      <div style="display:flex;align-items:baseline;justify-content:flex-end;gap:8px">
        <span data-hud="ammo" style="font-size:26px;font-weight:800;letter-spacing:.02em"></span>
        <span style="font-size:11px;opacity:.75">/ MAG</span>
      </div>
      <div data-hud="mag-pips" style="display:flex;gap:3px;justify-content:flex-end;margin-top:5px"></div>
      <div style="display:flex;justify-content:flex-end;align-items:baseline;gap:6px;margin-top:5px">
        <span style="font-size:11px;opacity:.75">RESERVE</span>
        <span data-hud="reserve" style="font-size:14px;font-weight:700"></span>
      </div>
      <div data-hud="reload" style="margin-top:6px;height:4px;border-radius:2px;background:rgba(233,247,255,.14);overflow:hidden;visibility:hidden">
        <div data-hud="reload-fill" style="height:100%;width:0;background:#7ef8ff"></div>
      </div>
    </div>
    <button data-hud="fire" type="button" style="position:absolute;right:24px;bottom:20px;pointer-events:auto;padding:14px 26px;border-radius:10px;border:1px solid rgba(80,220,255,.5);background:rgba(4,8,14,.92);color:#e8f4ff;font:700 15px/1 ui-sans-serif,system-ui,sans-serif;cursor:pointer;letter-spacing:.06em">FIRE (J)</button>
    <div data-hud="start" style="position:absolute;left:50%;bottom:24px;transform:translateX(-50%);padding:9px 16px;border-radius:8px;background:rgba(4,8,14,.85);border:1px solid rgba(80,220,255,.35);font-size:13px">J or F fires · WASD moves · R reloads · T resets</div>
    <div data-hud="crosshair" style="position:absolute;left:50%;top:50%;width:18px;height:18px;margin:-9px 0 0 -9px">
      <div style="position:absolute;left:8px;top:0;width:2px;height:5px;background:rgba(233,247,255,.9)"></div>
      <div style="position:absolute;left:8px;bottom:0;width:2px;height:5px;background:rgba(233,247,255,.9)"></div>
      <div style="position:absolute;top:8px;left:0;height:2px;width:5px;background:rgba(233,247,255,.9)"></div>
      <div style="position:absolute;top:8px;right:0;height:2px;width:5px;background:rgba(233,247,255,.9)"></div>
      <div style="position:absolute;left:8px;top:8px;width:2px;height:2px;background:#7ef8ff"></div>
    </div>
    <div data-hud="hit-marker" style="position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;opacity:0;transition:opacity .08s ease">
      <div style="position:absolute;left:2px;top:2px;width:8px;height:2px;background:#ffb020;transform:rotate(45deg);transform-origin:right center"></div>
      <div style="position:absolute;right:2px;top:2px;width:8px;height:2px;background:#ffb020;transform:rotate(-45deg);transform-origin:left center"></div>
      <div style="position:absolute;left:2px;bottom:2px;width:8px;height:2px;background:#ffb020;transform:rotate(-45deg);transform-origin:right center"></div>
      <div style="position:absolute;right:2px;bottom:2px;width:8px;height:2px;background:#ffb020;transform:rotate(45deg);transform-origin:left center"></div>
    </div>
    <div data-hud="banner" style="position:absolute;left:50%;top:24%;transform:translateX(-50%);padding:16px 26px;border-radius:12px;background:rgba(4,8,14,.9);border:1px solid rgba(80,220,255,.4);font-size:24px;letter-spacing:.06em;display:none;text-align:center"></div>
    <div data-hud="pause" style="position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(2,4,8,.42);font-size:18px;letter-spacing:.14em">PAUSED — press P to resume</div>
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

  setText(root, "score", "SCORE " + state.score);
  setText(root, "objective", state.objective);
  setText(root, "status", state.status + (state.paused ? " · paused" : "") + " · hostiles " + remaining + "/" + ENEMIES.length);

  // Hostile pips: one diamond per hostile, dimmed once down.
  const hostiles = root.querySelector("[data-hud=\"hostiles\"]");
  const pipsKey = "hostiles-" + state.killed.length;
  if (hostiles instanceof HTMLElement && cache.get("hostiles") !== pipsKey) {
    cache.set("hostiles", pipsKey);
    hostiles.innerHTML = ENEMIES.map((enemy) => {
      const down = state.killed.includes("enemy-" + enemy.id);
      return "<span style=\"width:14px;height:14px;transform:rotate(45deg);border-radius:2px;background:" +
        (down ? "rgba(233,247,255,.12)" : "#ff4fd0") +
        ";border:1px solid rgba(255,79,208,.6)\"></span>";
    }).join("");
  }

  const hpPct = Math.max(0, Math.min(1, state.hp / MAX_HP));
  setText(root, "hp", String(Math.round(state.hp)));
  const hpFill = root.querySelector("[data-hud=\"hp-fill\"]");
  if (hpFill instanceof HTMLElement) {
    hpFill.style.width = (hpPct * 100).toFixed(1) + "%";
    hpFill.style.background = hpPct > 0.55 ? "#3dffb0" : hpPct > 0.28 ? "#ffb020" : "#ff4a3d";
  }

  setText(root, "ammo", String(state.ammo));
  setText(root, "reserve", String(state.reserve));

  // Mag pips: spent ticks go dark.
  const magPips = root.querySelector("[data-hud=\"mag-pips\"]");
  const magKey = "mag-" + state.ammo;
  if (magPips instanceof HTMLElement && cache.get("mag") !== magKey) {
    cache.set("mag", magKey);
    magPips.innerHTML = Array.from({ length: MAG_SIZE }, (_unused, index) => {
      const loaded = index < state.ammo;
      return "<span style=\"width:7px;height:12px;border-radius:1.5px;background:" +
        (loaded ? "#7ef8ff" : "rgba(233,247,255,.14)") + "\"></span>";
    }).join("");
  }

  const reloadBox = root.querySelector("[data-hud=\"reload\"]");
  const reloadFill = root.querySelector("[data-hud=\"reload-fill\"]");
  if (reloadBox instanceof HTMLElement && reloadFill instanceof HTMLElement) {
    if (state.reloadClock > 0) {
      reloadBox.style.visibility = "visible";
      reloadFill.style.width = ((1 - state.reloadClock / RELOAD_TIME) * 100).toFixed(1) + "%";
    } else {
      reloadBox.style.visibility = "hidden";
    }
  }

  setText(root, "warn",
    state.status !== "playing" ? "" :
    state.reloadClock > 0 ? "RELOADING" :
    state.ammo === 0 ? "EMPTY — PRESS R" :
    state.ammo <= 3 ? "LOW AMMO" :
    state.hp <= 28 ? "CRITICAL" : "");

  const marker = root.querySelector("[data-hud=\"hit-marker\"]");
  if (marker instanceof HTMLElement) marker.style.opacity = state.hitMarker > 0 ? "1" : "0";
  const vignette = root.querySelector("[data-hud=\"vignette\"]");
  if (vignette instanceof HTMLElement) vignette.style.opacity = state.damageFlash > 0 ? "1" : "0";

  const start = root.querySelector("[data-hud=\"start\"]");
  if (start instanceof HTMLElement) start.style.display = state.shotsFired > 0 ? "none" : "block";
  const pause = root.querySelector("[data-hud=\"pause\"]");
  if (pause instanceof HTMLElement) pause.style.display = state.paused ? "flex" : "none";
  const banner = root.querySelector("[data-hud=\"banner\"]");
  if (banner instanceof HTMLElement) {
    const text = state.status === "won" ? "CORRIDOR CLEARED<br><span style=\"font-size:14px;opacity:.8\">Press R to reset</span>"
      : state.status === "lost" ? "YOU ARE DOWN<br><span style=\"font-size:14px;opacity:.8\">Press R to reset</span>" : "";
    if (cache.get("banner") !== text) {
      cache.set("banner", text);
      banner.innerHTML = text;
      banner.style.display = text ? "block" : "none";
    }
  }
}

function setText(root: HTMLElement, key: string, text: string): void {
  if (cache.get(key) === text) return;
  cache.set(key, text);
  const node = root.querySelector("[data-hud=\"" + key + "\"]");
  if (node) node.textContent = text;
}
