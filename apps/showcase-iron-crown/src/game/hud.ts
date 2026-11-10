import type { Difficulty } from "./ai";
import { FIGHTERS, PALETTE_SWATCHES, type FighterDef, type FighterId, type PaletteId } from "./fighters";
import { STAGES, type StageId } from "./stages";

/**
 * DOM HUD + menu sheets for Iron Crown. All elements live in index.html;
 * this module owns state → DOM sync and menu grid construction. The engine's
 * own `.a3g-hud` banner stays available for juice announcements; the DOM
 * layer carries the fight-plate chrome.
 */

export type ModeId = "quick" | "lab" | "ladder" | "versus" | "studio";
export type MenuId = "mode" | "versus" | "ladder" | "studio" | "pause" | "result" | "controls" | null;

export interface HudCallbacks {
  readonly onMode: (mode: ModeId) => void;
  readonly onStage: (stage: StageId) => void;
  readonly onFighter: (fighter: FighterId) => void;
  readonly onAutopilotToggle: () => void;
  readonly onVersusFight: (sel: { p1: FighterId; cpu: FighterId; stage: StageId; difficulty: Difficulty }) => void;
  readonly onLadderStart: (fighter: FighterId) => void;
  readonly onStudioApply: (fighter: FighterId, palette: PaletteId) => void;
  readonly onStudioFight: (fighter: FighterId, palette: PaletteId) => void;
  readonly onPauseResume: () => void;
  readonly onPauseRematch: () => void;
  readonly onPauseQuit: () => void;
  /** A setup sheet's Back button: close the sheet and resume the bout underneath. */
  readonly onMenuBack: () => void;
  readonly onPauseControls: () => void;
  readonly onLabStance: (stance: string) => void;
  readonly onLabReset: () => void;
  readonly onFrameData: (on: boolean) => void;
}

export interface ResultSpec {
  readonly title: string;
  readonly sub: string;
  readonly stats: readonly { label: string; value: string }[];
  readonly primary: { label: string; run: () => void };
  readonly alt?: { label: string; run: () => void };
}

interface PickItem {
  readonly id: string;
  readonly label: string;
  readonly sub?: string;
  readonly swatch?: string;
  readonly portraitId?: FighterId;
  readonly disabled?: boolean;
}

let svgSeq = 0;

/** Bespoke stylized dark-fantasy rim-lit bust portraits for the HUD plates and fighter picker cards. */
export function fighterPortraitSvg(id: FighterId): string {
  const uid = `icp-${id}-${++svgSeq}`;
  const themes: Record<FighterId, { bg: string; rim: string; glow: string; crest: string }> = {
    kenji: {
      bg: "#0e1a2e",
      rim: "#57c8ff",
      glow: "#1f5aa6",
      crest:
        /* Martial gi shoulders + storm headband + trailing ribbon + sharp brow */
        `<path d="M10 58c3-11 11-16 22-16s19 5 22 16H10Z" fill="#182b49" stroke="#57c8ff" stroke-width="1.4"/>` +
        `<path d="M22 42l10 13 10-13" fill="none" stroke="#bfeaff" stroke-width="1.8"/>` +
        `<path d="M22 26c0-7 4.5-12 10-12s10 5 10 12c0 6.5-4.2 12-10 12s-10-5.5-10-12Z" fill="#23385c" stroke="#8ad8ff" stroke-width="1.3"/>` +
        `<path d="M20 22h24l9-4-5 6 7 2-11-1H20Z" fill="#ffd76a"/>` +
        `<path d="M26 26l4 1.5M38 26l-4 1.5" stroke="#e8f7ff" stroke-width="1.8" stroke-linecap="round"/>`
    },
    volt: {
      bg: "#16112b",
      rim: "#38e8ff",
      glow: "#5a2ca8",
      crest:
        /* High tech-collar + sleek cyber visor + twin lightning conduits */
        `<path d="M11 58l6-15 15-3 15 3 6 15H11Z" fill="#211a3e" stroke="#38e8ff" stroke-width="1.4"/>` +
        `<path d="M19 40l5-9h16l5 9" fill="#141029" stroke="#7d6bff" stroke-width="1.4"/>` +
        `<path d="M23 25c0-6.8 4-11.5 9-11.5s9 4.7 9 11.5-4 11.5-9 11.5-9-4.7-9-11.5Z" fill="#28224a" stroke="#7defff" stroke-width="1.3"/>` +
        `<polygon points="21,23 43,23 40,28 24,28" fill="#38e8ff"/>` +
        `<polyline points="32,43 29,50 34,50 31,57" fill="none" stroke="#ffd76a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`
    },
    boulder: {
      bg: "#23160e",
      rim: "#f5a638",
      glow: "#7a3b12",
      crest:
        /* Massive riveted iron pauldrons + horned colossus brow + forge core */
        `<path d="M6 58c2-14 11-20 26-20s24 6 26 20H6Z" fill="#332218" stroke="#f5a638" stroke-width="1.6"/>` +
        `<circle cx="16" cy="48" r="2" fill="#ffd76a"/><circle cx="48" cy="48" r="2" fill="#ffd76a"/>` +
        `<path d="M21 27c0-7 4.8-12 11-12s11 5 11 12-4.8 11-11 11-11-4-11-11Z" fill="#473022" stroke="#ffc978" stroke-width="1.4"/>` +
        `<path d="M20 22l-6-8 8 4h20l8-4-6 8Z" fill="#d9a441"/>` +
        `<polygon points="32,43 37,49 32,55 27,49" fill="#ff7a2f" stroke="#ffe08a" stroke-width="1.2"/>`
    },
    seraph: {
      bg: "#241b12",
      rim: "#ffe08a",
      glow: "#8a6120",
      crest:
        /* Solar halo arc + winged valkyrie circlet + gilded gorget */
        `<circle cx="32" cy="25" r="16" fill="none" stroke="#ffe08a" stroke-width="1.3" stroke-dasharray="4 2.5"/>` +
        `<path d="M11 58c4-12 11-17 21-17s17 5 21 17H11Z" fill="#36291c" stroke="#ffe08a" stroke-width="1.4"/>` +
        `<path d="M23 26c0-6.5 4-11.5 9-11.5s9 5 9 11.5-4 11.5-9 11.5-9-5-9-11.5Z" fill="#4a3926" stroke="#fff2c6" stroke-width="1.3"/>` +
        `<path d="M21 21l-7-6 3 9 15-3 15 3 3-9-7 6-11-3Z" fill="#ffe08a"/>` +
        `<path d="M32 41v15M27 46l5-4 5 4" fill="none" stroke="#fff2c6" stroke-width="1.6" stroke-linecap="round"/>`
    },
    jinx: {
      bg: "#240f1d",
      rim: "#ff5478",
      glow: "#7a1842",
      crest:
        /* Shadow cowl + twin-horn trickster mask + glowing slit eyes */
        `<path d="M10 58c4-13 11-18 22-18s18 5 22 18H10Z" fill="#2e1427" stroke="#ff5478" stroke-width="1.4"/>` +
        `<path d="M22 27c0-6.8 4.4-12 10-12s10 5.2 10 12-4.4 11.5-10 11.5-10-4.7-10-11.5Z" fill="#3c1a33" stroke="#ff96ad" stroke-width="1.3"/>` +
        `<path d="M24 17l-5-9 9 6M40 17l5-9-9 6" fill="#ff5478"/>` +
        `<path d="M25 26l5 2-5 1.5ZM39 26l-5 2 5 1.5Z" fill="#ffe08a"/>` +
        `<path d="M25 44l7 8 7-8" fill="none" stroke="#ff96ad" stroke-width="1.5"/>`
    },
    sovereign: {
      bg: "#1c1214",
      rim: "#d9a441",
      glow: "#9e1b22",
      crest:
        /* Spiked regal mantle + five-spire Iron Crown helm + burning visor slit */
        `<path d="M8 58c3-13 11-18 24-18s21 5 24 18H8Z" fill="#26181b" stroke="#d9a441" stroke-width="1.6"/>` +
        `<path d="M21 28c0-6.5 4.8-11 11-11s11 4.5 11 11-4.8 11.5-11 11.5-11-5-11-11.5Z" fill="#1f1618" stroke="#f4cf7a" stroke-width="1.4"/>` +
        `<polygon points="19,21 21,10 26,18 32,7 38,18 43,10 45,21" fill="#d9a441" stroke="#ffe08a" stroke-width="1"/>` +
        `<polygon points="24,27 40,27 37,30 27,30" fill="#ff4d1f"/>` +
        `<path d="M24 44l8 10 8-10" fill="none" stroke="#ffe08a" stroke-width="1.6"/>`
    }
  };
  const t = themes[id] ?? themes.kenji;
  return (
    `<svg viewBox="0 0 64 64" width="100%" height="100%" focusable="false" aria-hidden="true">` +
    `<defs><radialGradient id="${uid}" cx="50%" cy="32%" r="65%">` +
    `<stop offset="0%" stop-color="${t.glow}"/><stop offset="100%" stop-color="${t.bg}"/>` +
    `</radialGradient></defs>` +
    `<rect x="2" y="2" width="60" height="60" rx="8" fill="url(#${uid})" stroke="${t.rim}" stroke-opacity="0.72" stroke-width="1.6"/>` +
    t.crest +
    `</svg>`
  );
}

const DIFFICULTIES: readonly { id: Difficulty; label: string; sub: string }[] = [
  { id: "novice", label: "NOVICE", sub: "learn the ropes" },
  { id: "scrapper", label: "SCRAPPER", sub: "a fair fight" },
  { id: "champion", label: "CHAMPION", sub: "no mercy" }
];

export interface Hud {
  setNames(p1: string, p2: string): void;
  setPortraits(p1: FighterId, p2: FighterId): void;
  setBars(side: "p1" | "p2", healthPct: number, meterPct: number): void;
  setPips(p1: number, p2: number): void;
  setTimer(seconds: number | null): void;
  setRoundLabel(text: string): void;
  setModeLabel(text: string): void;
  setHint(text: string): void;
  combo(side: "p1" | "p2", count: number): void;
  announce(main: string, sub?: string, variant?: "pop" | "hold"): void;
  /** IC47-H1: slam a plate or the round timer in (C1 intro sync); CSS stills it on reduced motion. */
  slam(target: "p1" | "p2" | "center"): void;
  setInputs(inputs: readonly { label: string; attack?: boolean }[]): void;
  showLab(show: boolean): void;
  setLabStance(stance: string): void;
  setFrameData(text: string | null): void;
  cancelFlash(): void;
  showMenu(id: MenuId): void;
  setLadderCard(html: string): void;
  renderBracket(rungs: readonly { label: string; state: "pending" | "current" | "won" | "lost" }[]): void;
  showResult(spec: ResultSpec): void;
  setStageButtons(active: StageId): void;
  setModeButtons(active: ModeId): void;
  setFighterButtons(active: FighterId): void;
  setAutopilotButton(active: boolean): void;
}

function el<T extends HTMLElement>(doc: Document, id: string): T {
  const node = doc.getElementById(id);
  if (!node) throw new Error(`IRON_CROWN_HUD_MISSING: #${id}`);
  return node as T;
}

export function createHud(doc: Document, cb: HudCallbacks): Hud {
  const healthP1 = el<HTMLDivElement>(doc, "fh-health-p1");
  const chipP1 = el<HTMLDivElement>(doc, "fh-health-chip-p1");
  const meterP1 = el<HTMLDivElement>(doc, "fh-meter-p1");
  const meterBoxP1 = meterP1.parentElement!;
  const meterRowP1 = meterBoxP1.parentElement;
  const healthP2 = el<HTMLDivElement>(doc, "fh-health-p2");
  const chipP2 = el<HTMLDivElement>(doc, "fh-health-chip-p2");
  const meterP2 = el<HTMLDivElement>(doc, "fh-meter-p2");
  const meterBoxP2 = meterP2.parentElement!;
  const meterRowP2 = meterBoxP2.parentElement;
  const portraitP1 = doc.getElementById("fh-portrait-p1");
  const portraitP2 = doc.getElementById("fh-portrait-p2");
  const hpValP1 = doc.getElementById("fh-hp-val-p1");
  const hpValP2 = doc.getElementById("fh-hp-val-p2");
  if (portraitP1) portraitP1.innerHTML = fighterPortraitSvg("kenji");
  if (portraitP2) portraitP2.innerHTML = fighterPortraitSvg("volt");
  const nameP1 = el<HTMLDivElement>(doc, "fh-name-p1");
  const nameP2 = el<HTMLDivElement>(doc, "fh-name-p2");
  // On phones the plates are too narrow for full names: show the first name, keep the full name as a tooltip.
  let fullNames: [string, string] = ["", ""];
  const narrow = typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia("(max-width: 640px)") : null;
  const paintNames = (): void => {
    const first = (n: string): string => n.trim().split(/\s+/)[0] ?? n;
    const short = narrow?.matches ?? false;
    nameP1.textContent = short ? first(fullNames[0]) : fullNames[0];
    nameP2.textContent = short ? first(fullNames[1]) : fullNames[1];
    nameP1.title = fullNames[0];
    nameP2.title = fullNames[1];
  };
  narrow?.addEventListener?.("change", paintNames);
  const pipsP1 = el<HTMLDivElement>(doc, "fh-pips-p1");
  const pipsP2 = el<HTMLDivElement>(doc, "fh-pips-p2");
  const timer = el<HTMLDivElement>(doc, "fh-timer");
  const round = el<HTMLDivElement>(doc, "fh-round");
  const mode = el<HTMLDivElement>(doc, "fh-mode");
  const hint = el<HTMLElement>(doc, "fh-hint");
  const comboP1 = el<HTMLDivElement>(doc, "fh-combo-p1");
  const comboP2 = el<HTMLDivElement>(doc, "fh-combo-p2");
  const announceBox = el<HTMLDivElement>(doc, "fh-announce");
  const announceMain = el<HTMLSpanElement>(doc, "fh-announce-main");
  const announceSub = el<HTMLElement>(doc, "fh-announce-sub");
  const inputs = el<HTMLDivElement>(doc, "fh-inputs");
  const lab = el<HTMLElement>(doc, "fh-lab");
  const labStance = el<HTMLDivElement>(doc, "fh-lab-stance");
  const frameDataBtn = el<HTMLButtonElement>(doc, "fh-framedata-toggle");
  const frameDataTxt = el<HTMLSpanElement>(doc, "fh-framedata");
  const cancelLine = el<HTMLDivElement>(doc, "fh-cancel");
  const labReset = el<HTMLButtonElement>(doc, "fh-lab-reset");
  const topBar = doc.querySelector<HTMLElement>(".aura3d-top-bar");
  const fhTop = doc.querySelector<HTMLElement>(".fh-top");
  const syncTopbarOffset = (): void => {
    if (!topBar || !fhTop) return;
    const rect = topBar.getBoundingClientRect();
    if (rect.height > 0) {
      const nextTop = Math.max(46, Math.round(rect.bottom + 6));
      fhTop.style.top = `${nextTop}px`;
      lab.style.top = `${nextTop + 82}px`;
    }
  };
  syncTopbarOffset();
  window.addEventListener("resize", syncTopbarOffset);
  window.requestAnimationFrame(syncTopbarOffset);
  const menus: Record<Exclude<MenuId, null>, HTMLElement> = {
    mode: el(doc, "menu-mode"),
    versus: el(doc, "menu-versus"),
    ladder: el(doc, "menu-ladder"),
    studio: el(doc, "menu-studio"),
    pause: el(doc, "menu-pause"),
    result: el(doc, "menu-result"),
    controls: el(doc, "menu-controls")
  };

  /* -------- pick grids -------- */
  const selections = {
    "fighter-p1": "kenji" as string,
    "fighter-cpu": "volt" as string,
    "fighter-ladder": "kenji" as string,
    "fighter-studio": "kenji" as string,
    stage: "crown-arena" as string,
    difficulty: "scrapper" as string,
    palette: "default" as string
  };

  function buildGrid(gridName: keyof typeof selections, items: readonly PickItem[], onPick?: (id: string) => void): void {
    const host = doc.querySelector<HTMLElement>(`[data-grid="${gridName}"]`);
    if (!host) return;
    host.textContent = "";
    for (const item of items) {
      const btn = doc.createElement("button");
      btn.type = "button";
      btn.dataset.pick = item.id;
      btn.setAttribute("aria-pressed", String(selections[gridName] === item.id));
      if (item.disabled) btn.disabled = true;
      if (item.portraitId) {
        const bust = doc.createElement("span");
        bust.className = "ic-bust";
        bust.innerHTML = fighterPortraitSvg(item.portraitId);
        btn.append(bust);
      } else if (item.swatch) {
        const sw = doc.createElement("span");
        sw.className = "ic-sw";
        sw.style.background = item.swatch;
        btn.append(sw);
      }
      const label = doc.createElement("span");
      label.textContent = item.label;
      btn.append(label);
      if (item.sub) {
        const sub = doc.createElement("small");
        sub.textContent = item.sub;
        btn.append(sub);
      }
      btn.addEventListener("click", () => {
        selections[gridName] = item.id;
        host.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
        onPick?.(item.id);
      });
      host.append(btn);
    }
  }

  const fighterItems = (excludeSovereign: boolean): readonly PickItem[] =>
    FIGHTERS.filter((f) => !excludeSovereign || f.id !== "sovereign").map((f: FighterDef) => ({
      id: f.id,
      label: f.name,
      sub: f.title,
      portraitId: f.id,
      swatch: f.palette.emissive || f.palette.color
    }));

  buildGrid("fighter-p1", fighterItems(true));
  buildGrid("fighter-cpu", fighterItems(false));
  buildGrid("fighter-ladder", fighterItems(true));
  buildGrid("fighter-studio", fighterItems(true), (id) => renderBio(id as FighterId));
  buildGrid(
    "stage",
    STAGES.map((s) => ({ id: s.id, label: s.label.toUpperCase(), sub: s.venue }))
  );
  buildGrid(
    "difficulty",
    DIFFICULTIES.map((d) => ({ id: d.id, label: d.label, sub: d.sub }))
  );
  buildGrid(
    "palette",
    PALETTE_SWATCHES.map((p) => ({ id: p.id, label: p.label, swatch: p.color }))
  );

  function renderBio(id: FighterId): void {
    const bio = el<HTMLDivElement>(doc, "studio-bio");
    const f = FIGHTERS.find((fighter) => fighter.id === id);
    if (!f) return;
    bio.innerHTML = "";
    const head = doc.createElement("div");
    head.className = "ic-bio-head";
    const bust = doc.createElement("span");
    bust.className = "ic-bust ic-bust-bio";
    bust.innerHTML = fighterPortraitSvg(f.id);
    const title = doc.createElement("b");
    title.textContent = `${f.name} · ${f.title}`;
    head.append(bust, title);
    const blurb = doc.createElement("p");
    blurb.textContent = f.bio;
    const stats = doc.createElement("div");
    stats.className = "bio-stats";
    const rows: [string, string][] = [
      ["Archetype", f.archetype],
      ["Health", String(f.stats.maxHealth)],
      ["Damage", `${Math.round(f.stats.damage * 100)}%`],
      ["Defense", `${Math.round((2 - f.stats.defense) * 50)}%`],
      ["Walk", `${f.stats.walkSpeed.toFixed(1)} m/s`],
      ["Reach", `${Math.round(f.stats.reach * 100)}%`],
      ["Special", f.special.name]
    ];
    for (const [k, v] of rows) {
      const key = doc.createElement("i");
      key.textContent = k;
      const val = doc.createElement("span");
      val.textContent = v;
      stats.append(key, val);
    }
    bio.append(head, blurb, stats);
  }
  renderBio("kenji");

  /* -------- static button wiring -------- */
  // A clicked button keeps DOM focus and would swallow Space/Enter as
  // click — Space is Jump, so a focused button re-fires mid-fight and
  // restarts the bout. Blur every activated button so game keys stay game
  // keys; intentional re-clicks still work.
  doc.addEventListener(
    "click",
    (e) => {
      const el = (e.target as HTMLElement | null)?.closest?.("button") as HTMLButtonElement | null;
      el?.blur();
    },
    true
  );
  doc.querySelectorAll<HTMLButtonElement>("[data-mode-pick]").forEach((btn) => {
    btn.addEventListener("click", () => cb.onMode(btn.dataset.modePick as ModeId));
  });
  doc.querySelectorAll<HTMLButtonElement>("#ic-modes button[data-mode]").forEach((btn) => {
    btn.addEventListener("click", () => cb.onMode(btn.dataset.mode as ModeId));
  });
  doc.querySelectorAll<HTMLButtonElement>("#ic-venues button[data-stage]").forEach((btn) => {
    btn.addEventListener("click", () => cb.onStage(btn.dataset.stage as StageId));
  });
  doc.querySelectorAll<HTMLButtonElement>("#ic-fighters button[data-fighter]").forEach((btn) => {
    btn.addEventListener("click", () => cb.onFighter(btn.dataset.fighter as FighterId));
  });
  doc.getElementById("ic-autopilot")?.addEventListener("click", () => cb.onAutopilotToggle());
  doc.querySelectorAll<HTMLButtonElement>("[data-menu-close]").forEach((btn) => {
    btn.addEventListener("click", () => cb.onMenuBack());
  });
  el<HTMLButtonElement>(doc, "versus-fight").addEventListener("click", () =>
    cb.onVersusFight({
      p1: selections["fighter-p1"] as FighterId,
      cpu: selections["fighter-cpu"] as FighterId,
      stage: selections.stage as StageId,
      difficulty: selections.difficulty as Difficulty
    })
  );
  el<HTMLButtonElement>(doc, "ladder-start").addEventListener("click", () =>
    cb.onLadderStart(selections["fighter-ladder"] as FighterId)
  );
  el<HTMLButtonElement>(doc, "studio-apply").addEventListener("click", () =>
    cb.onStudioApply(selections["fighter-studio"] as FighterId, selections.palette as PaletteId)
  );
  el<HTMLButtonElement>(doc, "studio-fight").addEventListener("click", () =>
    cb.onStudioFight(selections["fighter-studio"] as FighterId, selections.palette as PaletteId)
  );
  el<HTMLButtonElement>(doc, "pause-resume").addEventListener("click", cb.onPauseResume);
  el<HTMLButtonElement>(doc, "pause-rematch").addEventListener("click", cb.onPauseRematch);
  el<HTMLButtonElement>(doc, "pause-quit").addEventListener("click", cb.onPauseQuit);
  el<HTMLButtonElement>(doc, "pause-controls").addEventListener("click", cb.onPauseControls);
  labReset.addEventListener("click", cb.onLabReset);
  frameDataBtn.addEventListener("click", () => {
    const next = frameDataBtn.getAttribute("aria-pressed") !== "true";
    frameDataBtn.setAttribute("aria-pressed", String(next));
    cb.onFrameData(next);
  });
  labStance.querySelectorAll<HTMLButtonElement>("button[data-stance]").forEach((btn) => {
    btn.addEventListener("click", () => {
      labStance.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
      cb.onLabStance(btn.dataset.stance ?? "stand");
    });
  });

  let resultPrimary: (() => void) | undefined;
  let resultAlt: (() => void) | undefined;
  el<HTMLButtonElement>(doc, "result-primary").addEventListener("click", () => resultPrimary?.());
  el<HTMLButtonElement>(doc, "result-alt").addEventListener("click", () => resultAlt?.());
  el<HTMLButtonElement>(doc, "result-menu").addEventListener("click", cb.onPauseQuit);

  function showMenuSafe(id: MenuId): void {
    for (const [key, menu] of Object.entries(menus)) {
      (menu as HTMLElement).hidden = key !== id;
    }
  }

  let announceTimer = 0;

  return {
    setNames(p1, p2) {
      fullNames = [p1, p2];
      paintNames();
    },
    setPortraits(p1, p2) {
      if (portraitP1) portraitP1.innerHTML = fighterPortraitSvg(p1);
      if (portraitP2) portraitP2.innerHTML = fighterPortraitSvg(p2);
    },
    setBars(side, healthPct, meterPct) {
      const h = Math.max(0, Math.min(1, healthPct));
      const m = Math.max(0, Math.min(1, meterPct));
      const hpPct = String(Math.max(0, Math.ceil(h * 100)));
      if (side === "p1") {
        healthP1.style.width = `${h * 100}%`;
        chipP1.style.width = `${h * 100}%`;
        meterP1.style.width = `${m * 100}%`;
        meterBoxP1.classList.toggle("full", m >= 1);
        meterRowP1?.classList.toggle("full", m >= 1);
        if (hpValP1) hpValP1.textContent = hpPct;
      } else {
        healthP2.style.width = `${h * 100}%`;
        chipP2.style.width = `${h * 100}%`;
        meterP2.style.width = `${m * 100}%`;
        meterBoxP2.classList.toggle("full", m >= 1);
        meterRowP2?.classList.toggle("full", m >= 1);
        if (hpValP2) hpValP2.textContent = hpPct;
      }
    },
    setPips(p1, p2) {
      pipsP1.querySelectorAll("i").forEach((pip, i) => pip.classList.toggle("won", i < p1));
      pipsP2.querySelectorAll("i").forEach((pip, i) => pip.classList.toggle("won", i < p2));
    },
    setTimer(seconds) {
      if (seconds === null) {
        timer.textContent = "∞";
        timer.classList.remove("low");
        return;
      }
      const s = Math.max(0, Math.ceil(seconds));
      timer.textContent = String(s);
      timer.classList.toggle("low", s <= 10);
    },
    setRoundLabel(text) {
      round.textContent = text;
    },
    setModeLabel(text) {
      mode.textContent = text;
    },
    setHint(text) {
      hint.textContent = text;
    },
    combo(side, count) {
      const box = side === "p1" ? comboP1 : comboP2;
      const b = box.querySelector("b");
      if (b) b.textContent = String(count);
      box.classList.toggle("show", count >= 2);
    },
    slam(target) {
      const node = target === "center" ? timer : doc.querySelector<HTMLElement>(`.fh-plate-${target}`);
      if (!node) return;
      node.classList.remove("ic-slam");
      // Restart the keyframes on a repeated slam.
      void node.offsetWidth;
      node.classList.add("ic-slam");
    },
    announce(main, sub = "", variant = "pop") {
      announceMain.textContent = main;
      announceSub.textContent = sub;
      announceBox.classList.remove("pop", "hold");
      // restart animation
      void announceBox.offsetWidth;
      announceBox.classList.add(variant);
      window.clearTimeout(announceTimer);
      if (variant === "hold") {
        announceTimer = window.setTimeout(() => announceBox.classList.remove("hold"), 2400);
      }
    },
    setInputs(list) {
      inputs.textContent = "";
      for (const item of list.slice(-10)) {
        const tag = doc.createElement("i");
        tag.textContent = item.label;
        if (item.attack) tag.classList.add("atk");
        inputs.append(tag);
      }
    },
    showLab(show) {
      lab.hidden = !show;
    },
    setLabStance(stance) {
      labStance.querySelectorAll("button").forEach((b) =>
        b.setAttribute("aria-pressed", String((b as HTMLElement).dataset.stance === stance))
      );
    },
    setFrameData(text) {
      frameDataTxt.textContent = text ?? "";
    },
    cancelFlash() {
      cancelLine.classList.add("hit");
      window.setTimeout(() => cancelLine.classList.remove("hit"), 700);
    },
    showMenu(id) {
      for (const [key, menu] of Object.entries(menus)) {
        (menu as HTMLElement).hidden = key !== id;
      }
    },
    setLadderCard(html) {
      el<HTMLDivElement>(doc, "ladder-card").innerHTML = html;
    },
    renderBracket(rungs) {
      const bracket = el<HTMLOListElement>(doc, "ladder-bracket");
      bracket.textContent = "";
      for (const rung of rungs) {
        const li = doc.createElement("li");
        li.textContent = rung.label;
        if (rung.state !== "pending") li.classList.add(rung.state);
        bracket.append(li);
      }
    },
    showResult(spec) {
      el<HTMLHeadingElement>(doc, "result-title").textContent = spec.title;
      el<HTMLParagraphElement>(doc, "result-sub").textContent = spec.sub;
      const stats = el<HTMLDivElement>(doc, "result-stats");
      stats.textContent = "";
      for (const s of spec.stats) {
        const span = doc.createElement("span");
        span.innerHTML = `${s.label} <b>${s.value}</b>`;
        stats.append(span);
      }
      const primary = el<HTMLButtonElement>(doc, "result-primary");
      primary.textContent = spec.primary.label;
      resultPrimary = spec.primary.run;
      const alt = el<HTMLButtonElement>(doc, "result-alt");
      if (spec.alt) {
        alt.hidden = false;
        alt.textContent = spec.alt.label;
        resultAlt = spec.alt.run;
      } else {
        alt.hidden = true;
        resultAlt = undefined;
      }
      showMenuSafe("result");
    },
    setStageButtons(active) {
      selections.stage = active;
      doc.querySelectorAll<HTMLButtonElement>("#ic-venues button").forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.stage === active))
      );
      doc.querySelectorAll<HTMLButtonElement>('[data-grid="stage"] button').forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.pick === active))
      );
    },
    setModeButtons(active) {
      doc.querySelectorAll<HTMLButtonElement>("#ic-modes button[data-mode]").forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.mode === active))
      );
    },
    setFighterButtons(active) {
      selections["fighter-p1"] = active;
      selections["fighter-ladder"] = active;
      selections["fighter-studio"] = active;
      doc.querySelectorAll<HTMLButtonElement>("#ic-fighters button").forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.fighter === active))
      );
      doc.querySelectorAll<HTMLButtonElement>('[data-grid="fighter-p1"] button').forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.pick === active))
      );
    },
    setAutopilotButton(active) {
      doc.getElementById("ic-autopilot")?.setAttribute("aria-pressed", String(active));
    }
  };
}
