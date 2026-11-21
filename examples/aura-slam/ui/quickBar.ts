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
  const cycleBtn = document.getElementById("aura-btn-venue-cycle") as HTMLButtonElement | null;
  const venues = [...document.querySelectorAll<HTMLButtonElement>("[data-aura-venue]")];
  const venueOrder = venues.map((b) => b.dataset.auraVenue || "hard");
  let activeVenue = venues.find((b) => b.classList.contains("active"))?.dataset.auraVenue || "hard";
  let autoplay = deps.autoplay;
  const syncCycleLabel = (id: string): void => {
    activeVenue = id;
    if (!cycleBtn) return;
    const match = venues.find((b) => b.dataset.auraVenue === id);
    cycleBtn.textContent = `${match?.textContent?.trim() || "NY"} ▾`;
  };
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
  cycleBtn?.addEventListener("click", () => {
    const idx = venueOrder.indexOf(activeVenue);
    const next = venueOrder[(idx + 1) % Math.max(1, venueOrder.length)] || "hard";
    deps.selectVenue(next);
    syncCycleLabel(next);
  });
  for (const button of venues) button.addEventListener("click", () => { const id = button.dataset.auraVenue || "hard"; deps.selectVenue(id); syncCycleLabel(id); });
  syncCycleLabel(activeVenue);
  return {
    setActiveMode,
    setVenue(id) { for (const b of venues) b.classList.toggle("active", b.dataset.auraVenue === id); syncCycleLabel(id); },
    setAutoplay(on) { autoplay = on; auto?.classList.toggle("active", on); }
  };
}
