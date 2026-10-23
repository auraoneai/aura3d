import { byId, setInert } from "./dom";

export interface PauseUiDeps {
  togglePause(): void;
  returnToMenu(): void;
  toggleSound(): boolean;
  toggleFullscreen(): void;
}
export interface PauseUi { sync(paused: boolean): void; setSound(enabled: boolean): void }

/** Pause card, sound and fullscreen buttons (game.js `syncPauseMenu` and the button handlers). */
export function createPauseUi(deps: PauseUiDeps): PauseUi {
  const sound = byId("sound-btn");
  function setSound(enabled: boolean): void {
    sound.classList.toggle("muted", !enabled);
    sound.textContent = enabled ? "♪" : "×";
    sound.setAttribute("aria-label", enabled ? "Mute sound" : "Enable sound");
    sound.setAttribute("aria-pressed", String(enabled));
  }
  byId("pause-btn").addEventListener("click", deps.togglePause);
  byId("resume-btn").addEventListener("click", deps.togglePause);
  byId("menu-btn").addEventListener("click", deps.returnToMenu);
  sound.addEventListener("click", () => setSound(deps.toggleSound()));
  byId("fullscreen-btn").addEventListener("click", deps.toggleFullscreen);
  return {
    setSound,
    sync(paused) {
      const panel = byId("pause-menu");
      panel.classList.toggle("hidden", !paused);
      panel.setAttribute("aria-hidden", String(!paused));
      setInert(panel, !paused);
      if (paused) byId("resume-btn").focus({ preventScroll: true });
      else if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    }
  };
}
