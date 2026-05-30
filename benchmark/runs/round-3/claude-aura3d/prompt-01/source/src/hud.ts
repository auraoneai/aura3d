// DOM overlay around the single Aura app: live contact-count readout, phase /
// settled stats, and a Reset control. Built as plain DOM (not a second canvas)
// per the build-playbook guidance for physics playgrounds.

import type { ContactStats, SimPhase } from "./physics";

const PHASE_LABEL: Record<SimPhase, string> = {
  dropping: "Dropping",
  settling: "Settling",
  "at-rest": "At rest",
};

const PHASE_COLOR: Record<SimPhase, string> = {
  dropping: "#f97316",
  settling: "#facc15",
  "at-rest": "#4ade80",
};

export interface Hud {
  update(stats: ContactStats, phase: SimPhase, elapsed: number): void;
}

export function createHud(onReset: () => void): Hud {
  const panel = document.createElement("div");
  panel.className = "pp-panel";
  panel.innerHTML = `
    <div class="pp-title">Physics Playground</div>
    <div class="pp-sub">50 rigid cubes · tilted ramp · contact solver</div>
    <div class="pp-contacts">
      <span class="pp-contacts-value" id="pp-contacts">0</span>
      <span class="pp-contacts-label">live contacts</span>
    </div>
    <div class="pp-grid">
      <div><span class="pp-k">Phase</span><span class="pp-v" id="pp-phase">—</span></div>
      <div><span class="pp-k">Settled</span><span class="pp-v" id="pp-settled">0 / 50</span></div>
      <div><span class="pp-k">Cube–ramp</span><span class="pp-v" id="pp-ramp">0</span></div>
      <div><span class="pp-k">Cube–cube</span><span class="pp-v" id="pp-cc">0</span></div>
      <div><span class="pp-k">Cube–floor</span><span class="pp-v" id="pp-floor">0</span></div>
      <div><span class="pp-k">Sim time</span><span class="pp-v" id="pp-time">0.0s</span></div>
    </div>
    <button class="pp-reset" id="pp-reset" type="button">⟳ Reset drop</button>
    <div class="pp-hint">Drag to orbit · Scroll to zoom</div>
  `;
  document.body.appendChild(panel);

  const elContacts = panel.querySelector<HTMLElement>("#pp-contacts")!;
  const elPhase = panel.querySelector<HTMLElement>("#pp-phase")!;
  const elSettled = panel.querySelector<HTMLElement>("#pp-settled")!;
  const elRamp = panel.querySelector<HTMLElement>("#pp-ramp")!;
  const elCc = panel.querySelector<HTMLElement>("#pp-cc")!;
  const elFloor = panel.querySelector<HTMLElement>("#pp-floor")!;
  const elTime = panel.querySelector<HTMLElement>("#pp-time")!;
  const elReset = panel.querySelector<HTMLButtonElement>("#pp-reset")!;

  elReset.addEventListener("click", () => {
    onReset();
    elReset.blur();
  });

  return {
    update(stats: ContactStats, phase: SimPhase, elapsed: number) {
      elContacts.textContent = String(stats.contacts);
      elPhase.textContent = PHASE_LABEL[phase];
      elPhase.style.color = PHASE_COLOR[phase];
      elSettled.textContent = `${stats.settled} / ${stats.settled + stats.falling}`;
      elRamp.textContent = String(stats.cubeRamp);
      elCc.textContent = String(stats.cubeCube);
      elFloor.textContent = String(stats.cubeFloor);
      elTime.textContent = `${elapsed.toFixed(1)}s`;
    },
  };
}
