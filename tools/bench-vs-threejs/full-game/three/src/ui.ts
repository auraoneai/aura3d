// @concern hud-screens
export function createUi(onPause: () => void, onRestart: () => void) {
  const root = document.createElement("div");
  root.className = "screens";
  root.innerHTML = `
    <div id="hud"></div>
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
    update: (score: number, timeLeft: number) => { $("hud").textContent = `SCORE ${score}   TIME ${timeLeft.toFixed(1)}`; },
    setPaused: (paused: boolean) => { $("paused").hidden = !paused; },
    showResults: (text: string) => { $("results-text").textContent = text; $("results").hidden = false; },
    hideResults: () => { $("results").hidden = true; },
    dispose: () => root.remove()
  };
}
