// @concern hud-screens
export interface Screens {
  setPaused(paused: boolean): void;
  showResults(text: string): void;
  hideResults(): void;
  dispose(): void;
}

// The kit's HUD draws score and time. Its shell menus are not DOM yet (shell.showResults is a stub),
// so the buttons, the pause label and the results overlay are plain DOM.
export function createScreens(onPause: () => void, onRestart: () => void): Screens {
  const root = document.createElement("div");
  root.className = "screens";
  root.innerHTML = `
    <div class="bar">
      <button id="pause-button">Pause</button>
      <button id="restart-button">Restart</button>
    </div>
    <div id="paused" class="overlay" hidden>Paused</div>
    <div id="results" class="overlay" hidden>
      <p id="results-text"></p>
      <button id="again-button">Play again</button>
    </div>`;
  document.body.append(root);
  const $ = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  $("pause-button").addEventListener("click", onPause);
  $("restart-button").addEventListener("click", onRestart);
  $("again-button").addEventListener("click", onRestart);
  return {
    setPaused: (paused) => { $("paused").hidden = !paused; },
    showResults: (text) => { $("results-text").textContent = text; $("results").hidden = false; },
    hideResults: () => { $("results").hidden = true; },
    dispose: () => root.remove()
  };
}
