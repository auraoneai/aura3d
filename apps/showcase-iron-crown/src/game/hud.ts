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
  readonly disabled?: boolean;
}

const DIFFICULTIES: readonly { id: Difficulty; label: string; sub: string }[] = [
  { id: "novice", label: "NOVICE", sub: "learn the ropes" },
  { id: "scrapper", label: "SCRAPPER", sub: "a fair fight" },
  { id: "champion", label: "CHAMPION", sub: "no mercy" }
];

export interface Hud {
  setNames(p1: string, p2: string): void;
  setBars(side: "p1" | "p2", healthPct: number, meterPct: number): void;
  setPips(p1: number, p2: number): void;
  setTimer(seconds: number | null): void;
  setRoundLabel(text: string): void;
  setModeLabel(text: string): void;
  setHint(text: string): void;
  combo(side: "p1" | "p2", count: number): void;
  announce(main: string, sub?: string, variant?: "pop" | "hold"): void;
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
  const healthP2 = el<HTMLDivElement>(doc, "fh-health-p2");
  const chipP2 = el<HTMLDivElement>(doc, "fh-health-chip-p2");
  const meterP2 = el<HTMLDivElement>(doc, "fh-meter-p2");
  const meterBoxP2 = meterP2.parentElement!;
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
  const topBar = doc.querySelector<HTMLElement>(".ic-topbar");
  const fhTop = doc.querySelector<HTMLElement>(".fh-top");
  const syncTopbarOffset = (): void => {
    if (!topBar || !fhTop) return;
    const rect = topBar.getBoundingClientRect();
    if (rect.height > 0) {
      const nextTop = Math.max(46, Math.round(rect.bottom + 8));
      fhTop.style.top = `${nextTop}px`;
      lab.style.top = `${nextTop + 72}px`;
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
      if (item.swatch) {
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
    const title = doc.createElement("b");
    title.textContent = `${f.name} · ${f.title}`;
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
    bio.append(title, blurb, stats);
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
    setBars(side, healthPct, meterPct) {
      const h = Math.max(0, Math.min(1, healthPct));
      const m = Math.max(0, Math.min(1, meterPct));
      if (side === "p1") {
        healthP1.style.width = `${h * 100}%`;
        chipP1.style.width = `${h * 100}%`;
        meterP1.style.width = `${m * 100}%`;
        meterBoxP1.classList.toggle("full", m >= 1);
      } else {
        healthP2.style.width = `${h * 100}%`;
        chipP2.style.width = `${h * 100}%`;
        meterP2.style.width = `${m * 100}%`;
        meterBoxP2.classList.toggle("full", m >= 1);
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
