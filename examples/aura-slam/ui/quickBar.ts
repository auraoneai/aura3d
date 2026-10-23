/** The quick-switch bar above the court: Quick Match, Smash Lab, Auto, Modes, and the six venue chips (live page toolbar). */
export interface QuickBarDeps {
  quickMatch(): void;
  smashLab(): void;
  openModes(): void;
  selectVenue(id: string): void;
  setAutoplay(on: boolean): void;
  autoplay: boolean;
}
export interface QuickBar { setActiveMode(mode: "play" | "practice" | "menu" | null): void; setVenue(id: string): void; setAutoplay(on: boolean): void }

export function createQuickBar(deps: QuickBarDeps): QuickBar {
  const play = document.getElementById("aura-btn-play");
  const practice = document.getElementById("aura-btn-practice");
  const auto = document.getElementById("aura-btn-auto") as HTMLButtonElement | null;
  const menu = document.getElementById("aura-btn-menu");
  const venues = [...document.querySelectorAll<HTMLButtonElement>("[data-aura-venue]")];
  let autoplay = deps.autoplay;
  const setActiveMode: QuickBar["setActiveMode"] = (mode) => {
    play?.classList.toggle("active", mode === "play");
    practice?.classList.toggle("active", mode === "practice");
    menu?.classList.toggle("active", mode === "menu");
  };
  auto?.classList.toggle("active", autoplay);
  auto?.addEventListener("click", () => { autoplay = !autoplay; auto.classList.toggle("active", autoplay); deps.setAutoplay(autoplay); auto.blur(); });
  play?.addEventListener("click", () => { deps.quickMatch(); setActiveMode("play"); });
  practice?.addEventListener("click", () => { deps.smashLab(); setActiveMode("practice"); });
  menu?.addEventListener("click", () => { deps.openModes(); setActiveMode("menu"); });
  for (const button of venues) button.addEventListener("click", () => deps.selectVenue(button.dataset.auraVenue || "hard"));
  return {
    setActiveMode,
    setVenue(id) { for (const b of venues) b.classList.toggle("active", b.dataset.auraVenue === id); },
    setAutoplay(on) { autoplay = on; auto?.classList.toggle("active", on); }
  };
}
