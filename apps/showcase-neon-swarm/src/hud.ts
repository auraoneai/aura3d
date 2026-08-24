/**
 * Neon Swarm DOM HUD bindings.
 *
 * UI only - HP pips, wave/score/combo readouts, pickup door buttons, run
 * summary, pause state, and touch stick chrome. None of this stands in for
 * renderer features; every visual 3D claim lives in the scene itself.
 */

export interface HudSnapshot {
  readonly state: "booting" | "intermission" | "wave-active" | "complete" | "dead";
  readonly wave: number;
  readonly score: number;
  readonly bestScore: number;
  readonly combo: number;
  readonly maxCombo: number;
  readonly burstCharge: number;
  readonly comboFraction: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly alive: number;
  readonly shieldCharges: number;
  readonly dashReadyFraction: number;
  readonly paused: boolean;
  readonly intermissionRemaining: number;
}

export interface HudDoorView {
  readonly kind: string;
  readonly label: string;
  readonly detail: string;
}

export interface TouchStickView {
  readonly id: string;
  readonly label: string;
  readonly centerX: number;
  readonly centerY: number;
  readonly radius: number;
}

export interface HudController {
  update(snapshot: HudSnapshot): void;
  showBanner(title: string, subtitle: string, sticky?: boolean): void;
  tickBanner(dt: number): void;
  hideBanner(): void;
  showDoors(): void;
  markDoorChosen(kind: string | null): void;
  hideDoors(): void;
  showSummary(score: number, wave: number, kills: number, bestScore: number): void;
  showVictory(score: number, kills: number, maxCombo: number, seed: number, bestScore: number): void;
  renderTouchSticks(sticks: readonly TouchStickView[]): void;
  flashVignette(): void;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': '&quot;',
    "'": "&#39;"
  })[char] ?? char);
}

function requireElement(root: HTMLElement, selector: string): HTMLElement {
  const el = root.querySelector(selector);
  if (!el) throw new Error("Neon Swarm HUD missing element: " + selector);
  return el as HTMLElement;
}

export function setupHud(
  container: HTMLElement,
  doors: readonly HudDoorView[],
  onChooseDoor: (kind: string) => void,
  onBurst: () => void
): HudController {
  container.innerHTML = [
    '<section class="ns-panel ns-panel--top-left">',
    '  <span class="ns-eyebrow">Neon Swarm</span>',
    '  <h1 class="ns-title">Rain-slick courier district</h1>',
    '  <div class="ns-stats">',
    '    <span>Wave</span><strong id="ns-wave">1</strong>',
    '    <span>Score</span><strong id="ns-score">0</strong>',
    '    <span>Best</span><strong id="ns-best">0</strong>',
    '    <span>Drones out</span><strong id="ns-alive">0</strong>',
    '    <span>Shield</span><strong id="ns-shield">0</strong>',
    '    <span>Dash</span><strong id="ns-dash">READY</strong>',
    '    <span>Burst</span><strong id="ns-burst-readout">0%</strong>',
    '  </div>',
    '  <div class="ns-combo"><i id="ns-combo-bar" style="width:0%"></i></div>',
    '  <div class="ns-hp" id="ns-hp"></div>',
    '</section>',
    '<section class="ns-panel ns-panel--top-right">',
    '  <span class="ns-eyebrow" id="ns-phase-label">Wave status</span>',
    '  <div class="ns-stats">',
    '    <span id="ns-timer-label">Arena</span><strong id="ns-timer">-</strong>',
    '  </div>',
    '</section>',
    '<div class="ns-banner" id="ns-banner" style="opacity:0"></div>',
    '<div class="ns-doors" id="ns-doors"></div>',
    '<button type="button" class="ns-burst-button" id="ns-burst-button">BURST <small>SPACE / K</small></button>',
    '<p class="ns-help">WASD move &middot; mouse aim &middot; J / click pulse &middot; Shift dash &middot; Space burst &middot; P pause &middot; R reset</p>',
    '<div id="ns-touch"></div>',
    '<div class="ns-vignette" id="ns-vignette" data-active="false"></div>'
  ].join("");

  const waveEl = requireElement(container, "#ns-wave");
  const scoreEl = requireElement(container, "#ns-score");
  const bestEl = requireElement(container, "#ns-best");
  const aliveEl = requireElement(container, "#ns-alive");
  const shieldEl = requireElement(container, "#ns-shield");
  const dashEl = requireElement(container, "#ns-dash");
  const burstReadoutEl = requireElement(container, "#ns-burst-readout");
  const burstButtonEl = requireElement(container, "#ns-burst-button");
  const comboBar = requireElement(container, "#ns-combo-bar");
  const hpEl = requireElement(container, "#ns-hp");
  const timerEl = requireElement(container, "#ns-timer");
  const timerLabelEl = requireElement(container, "#ns-timer-label");
  const phaseLabelEl = requireElement(container, "#ns-phase-label");
  const bannerEl = requireElement(container, "#ns-banner");
  const doorsEl = requireElement(container, "#ns-doors");
  const touchEl = requireElement(container, "#ns-touch");
  const vignetteEl = requireElement(container, "#ns-vignette");

  let lastHp = -1;
  let lastMaxHp = -1;
  let vignetteFrames = 0;
  let bannerSeconds = 0;

  function renderHpPips(hp: number, maxHp: number): void {
    if (hp === lastHp && maxHp === lastMaxHp) return;
    lastHp = hp;
    lastMaxHp = maxHp;
    let html = "";
    for (let i = 0; i < maxHp; i += 1) {
      html += '<b data-empty="' + (i >= hp ? "true" : "false") + '"></b>';
    }
    hpEl.innerHTML = html;
  }

  function renderDoors(): void {
    doorsEl.innerHTML = doors
      .map((door) =>
        '<button type="button" class="ns-door" data-kind="' + escapeHtml(door.kind) + '">' +
        escapeHtml(door.label) +
        "<small>" + escapeHtml(door.detail) + "</small></button>"
      )
      .join("");
    for (const button of Array.from(doorsEl.querySelectorAll("button"))) {
      button.addEventListener("click", () => onChooseDoor(button.dataset.kind ?? ""));
    }
    doorsEl.style.display = "none";
  }

  renderDoors();
  burstButtonEl.addEventListener("click", onBurst);

  return {
    update(snapshot) {
      waveEl.textContent = snapshot.wave + "/5";
      scoreEl.textContent = String(snapshot.score);
      bestEl.textContent = String(snapshot.bestScore);
      aliveEl.textContent = String(snapshot.alive);
      shieldEl.textContent = String(snapshot.shieldCharges);
      dashEl.textContent = snapshot.dashReadyFraction >= 1 ? "READY" : Math.round(snapshot.dashReadyFraction * 100) + "%";
      burstReadoutEl.textContent = Math.round(snapshot.burstCharge) + "%";
      burstButtonEl.toggleAttribute("data-ready", snapshot.burstCharge >= 100);
      comboBar.style.width = (Math.min(1, snapshot.comboFraction) * 100).toFixed(0) + "%";
      renderHpPips(snapshot.hp, snapshot.maxHp);
      phaseLabelEl.textContent = snapshot.state === "intermission" ? "Intermission" : "Run status";
      timerLabelEl.textContent = snapshot.state === "intermission" ? "Next wave in" : "Arena";
      timerEl.textContent = snapshot.paused
        ? "PAUSED"
        : snapshot.state === "complete"
          ? "COMPLETE"
          : snapshot.state === "dead"
            ? "RUN OVER"
            : snapshot.intermissionRemaining > 0
          ? Math.ceil(snapshot.intermissionRemaining) + "s"
          : "LIVE";
      if (vignetteFrames > 0) {
        vignetteFrames -= 1;
        if (vignetteFrames <= 0) vignetteEl.setAttribute("data-active", "false");
      }
    },
    tickBanner(dt) {
      if (bannerSeconds === Number.POSITIVE_INFINITY) return;
      if (bannerSeconds > 0) {
        bannerSeconds -= dt;
        if (bannerSeconds <= 0) bannerEl.style.opacity = "0";
      }
    },
    showBanner(title, subtitle, sticky = false) {
      bannerEl.innerHTML =
        "<h2>" + escapeHtml(title) + "</h2><p>" + escapeHtml(subtitle) + "</p>";
      bannerEl.style.opacity = "1";
      bannerSeconds = sticky ? Number.POSITIVE_INFINITY : 2.6;
    },
    hideBanner() {
      bannerSeconds = 0;
      bannerEl.style.opacity = "0";
    },
    showDoors() {
      doorsEl.style.display = "flex";
      for (const button of Array.from(doorsEl.querySelectorAll("button"))) {
        button.dataset.chosen = "false";
      }
    },
    markDoorChosen(kind) {
      for (const button of Array.from(doorsEl.querySelectorAll("button"))) {
        button.dataset.chosen = (button.dataset.kind ?? "") === kind ? "true" : "false";
      }
    },
    hideDoors() {
      doorsEl.style.display = "none";
    },
    showSummary(score, wave, kills, bestScore) {
      bannerEl.innerHTML =
        '<h2>Run over</h2><div class="ns-summary">Wave reached <strong>' + wave +
        "</strong> &middot; drones downed <strong>" + kills +
        "</strong><br>Final score <strong>" + score +
        "</strong> &middot; best <strong>" + bestScore +
        "</strong><br>Press <strong>R</strong> to reset to wave 1</div>";
      bannerEl.style.opacity = "1";
      bannerSeconds = Number.POSITIVE_INFINITY;
    },
    showVictory(score, kills, maxCombo, seed, bestScore) {
      bannerEl.innerHTML =
        '<h2>Finale survived</h2><div class="ns-summary">Five-wave vector panic cleared' +
        " &middot; drones downed <strong>" + kills +
        "</strong><br>Max combo <strong>" + maxCombo +
        "</strong> &middot; seed <strong>" + seed +
        "</strong><br>Final score <strong>" + score +
        "</strong> &middot; best <strong>" + bestScore +
        "</strong><br>Press <strong>R</strong> for a new run</div>";
      bannerEl.style.opacity = "1";
      bannerSeconds = Number.POSITIVE_INFINITY;
    },
    renderTouchSticks(sticks) {
      if (sticks.length === 0) {
        touchEl.innerHTML = "";
        return;
      }
      touchEl.innerHTML = sticks.map((stick) =>
        '<div class="ns-touch-stick" data-stick="' + escapeHtml(stick.id) +
        '" style="left:' + (stick.centerX - stick.radius) + "px;top:" + (stick.centerY - stick.radius) +
        "px;width:" + (stick.radius * 2) + "px;height:" + (stick.radius * 2) + 'px">' +
        '<div class="ns-touch-knob" style="width:' + stick.radius + "px;height:" + stick.radius + 'px"></div></div>'
      ).join("");
    },
    flashVignette() {
      vignetteEl.setAttribute("data-active", "true");
      vignetteFrames = 8;
    }
  };
}
