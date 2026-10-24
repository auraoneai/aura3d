/* Plain DOM HUD / pause / results overlay used by both scene-4 apps (identical, not counted as scene source). */
export interface Hud {
  update(score: number, timeLeft: number): void;
  setPaused(paused: boolean): void;
  showResults(text: string): void;
  hideResults(): void;
  root: HTMLElement;
}

export function createHud(): Hud {
  const root = document.createElement("div");
  root.style.cssText = "position:fixed;inset:0;pointer-events:none;font:500 13px/1.4 sans-serif;color:#fff";
  root.innerHTML = '<div id="hud-line" style="position:absolute;left:12px;top:8px"></div><div id="hud-pause" style="display:none;position:absolute;inset:0;background:#0008;place-items:center">PAUSED</div><div id="hud-results" style="display:none;position:absolute;inset:0;background:#000a;place-items:center"></div>';
  document.body.appendChild(root);
  const line = root.querySelector<HTMLElement>("#hud-line")!;
  const pause = root.querySelector<HTMLElement>("#hud-pause")!;
  const results = root.querySelector<HTMLElement>("#hud-results")!;
  return {
    root,
    update: (score, timeLeft) => { line.textContent = `SCORE ${score}   TIME ${timeLeft.toFixed(1)}`; },
    setPaused: (paused) => { pause.style.display = paused ? "grid" : "none"; },
    showResults: (text) => { results.textContent = text; results.style.display = "grid"; },
    hideResults: () => { results.style.display = "none"; }
  };
}
