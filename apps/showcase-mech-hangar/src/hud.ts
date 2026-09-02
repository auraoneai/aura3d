/**
 * Mech Hangar HUD — DOM chrome for both modes.
 *
 * The panel is UI only (PRD section 6): stat holograms, bout cards and the asset
 * passport are information surfaces. Every 3D claim lives in the rendered scene,
 * not here. Elements carry stable data-testid hooks for the route specs.
 */
import type { AggressionPreset, MechStats } from "./stats";
import { MECH_SLOTS, PART_OPTIONS, type BuildSelection, type MechSlot } from "./parts-catalog";
import { selectedParts } from "./parts-catalog";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

export interface BarSpec {
  readonly label: string;
  readonly value: number;
  /** 0..1 fraction of the bar. */
  readonly fraction: number;
  readonly testId: string;
}

export function createBar(spec: BarSpec): { root: HTMLDivElement; update(fraction: number, text?: string): void } {
  const root = el("div", "mech-bar");
  root.dataset.testid = spec.testId;
  const label = el("span", "mech-bar-label");
  label.textContent = spec.label;
  const track = el("div", "mech-bar-track");
  const fill = el("div", "mech-bar-fill");
  fill.style.width = Math.round(Math.max(0, Math.min(1, spec.fraction)) * 100) + "%";
  track.appendChild(fill);
  root.append(label, track);
  return {
    root,
    update(fraction, text) {
      fill.style.width = Math.round(Math.max(0, Math.min(1, fraction)) * 100) + "%";
      if (text !== undefined) label.textContent = text;
    }
  };
}

export interface HangarHudHandles {
  readonly root: HTMLElement;
  readonly slotButtons: Record<MechSlot, HTMLButtonElement>;
  readonly optionLabels: Record<MechSlot, HTMLElement>;
  readonly bars: {
    armor: ReturnType<typeof createBar>;
    speed: ReturnType<typeof createBar>;
    guard: ReturnType<typeof createBar>;
    power: ReturnType<typeof createBar>;
    specialCost: ReturnType<typeof createBar>;
  };
  readonly assemblyStatus: HTMLElement;
  readonly passport: HTMLElement;
  readonly lockButton: HTMLButtonElement;
}

/**
 * The visible hero is the source-owned MH-2M rigid assembly. Robotcand remains
 * registered as an attribution-backed fallback reference, but is not allowed
 * to stand in for the four typed sockets in the review frame.
 */
const VISUAL_SHELL_PASSPORT = {
  name: "MH-2M // FACETED MODULAR ASSEMBLY",
  asset: "Typed assets: chassis + arms + legs + weapon (4 socketed GLBs)",
  provenance: "Aura3D synthesis - original CC0-1.0 family",
  boundary: "Visible hero is rigid root/chest/hips/right-hand assembly; Robotcand remains a separate attributed fallback reference."
} as const;

export function setupHangarHud(host: HTMLElement, selection: BuildSelection): HangarHudHandles {
  host.textContent = "";
  const title = el("div", "mech-panel-title");
  title.textContent = "MECH HANGAR";

  const slotsBox = el("div", "mech-slots");
  const slotButtons = {} as Record<MechSlot, HTMLButtonElement>;
  const optionLabels = {} as Record<MechSlot, HTMLElement>;
  for (const slot of MECH_SLOTS) {
    const row = el("div", "mech-slot-row");
    const button = el("button", "mech-slot-button");
    button.type = "button";
    button.dataset.testid = "slot-" + slot;
    button.textContent = String(MECH_SLOTS.indexOf(slot) + 1) + " " + slot.toUpperCase();
    const optionLabel = el("span", "mech-option-label");
    optionLabel.dataset.testid = "option-" + slot;
    const options = PART_OPTIONS[slot];
    const def = options[selection[slot]];
    optionLabel.textContent = def ? def.displayName : "(pending curation)";
    row.append(button, optionLabel);
    slotsBox.appendChild(row);
    slotButtons[slot] = button;
    optionLabels[slot] = optionLabel;
  }

  const barsTitle = el("div", "mech-section-title");
  barsTitle.textContent = "STAT HOLOGRAMS";
  const armor = createBar({ label: "ARMOR", value: 0, fraction: 0.5, testId: "stat-armor-bar" });
  const speed = createBar({ label: "SPEED", value: 0, fraction: 0.5, testId: "stat-speed-bar" });
  const guard = createBar({ label: "GUARD", value: 0, fraction: 0.5, testId: "stat-guard-bar" });
  const power = createBar({ label: "POWER", value: 0, fraction: 0.5, testId: "stat-power-bar" });
  const specialCost = createBar({ label: "SPCOST", value: 0, fraction: 0.5, testId: "stat-special-cost-bar" });

  const assemblyStatus = el("div", "mech-assembly-status");
  assemblyStatus.dataset.testid = "assembly-status";

  const passportTitle = el("div", "mech-section-title");
  passportTitle.textContent = "ASSET PASSPORT";
  const passport = el("div", "mech-passport");
  passport.dataset.testid = "passport";

  const lockButton = el("button", "mech-lock-button");
  lockButton.type = "button";
  lockButton.dataset.testid = "lock-button";
  lockButton.textContent = "ENTER  LOCK BUILD -> ARENA";

  host.append(title, slotsBox, barsTitle, armor.root, speed.root, guard.root, power.root, specialCost.root, assemblyStatus, passportTitle, passport, lockButton);

  return { root: host, slotButtons, optionLabels, bars: { armor, speed, guard, power, specialCost }, assemblyStatus, passport, lockButton };
}

/** Refresh hangar panel contents from state (called on every change, not every frame). */
export function updateHangarHud(
  handles: HangarHudHandles,
  args: {
    selection: BuildSelection;
    activeSlot: MechSlot;
    stats: MechStats;
    assemblyReady: boolean;
    assemblyStatusLine: string;
    catalogReady: boolean;
  }
): void {
  for (const slot of MECH_SLOTS) {
    const options = PART_OPTIONS[slot];
    const def = options[args.selection[slot]];
    handles.slotButtons[slot].classList.toggle("is-active", slot === args.activeSlot);
    handles.optionLabels[slot].textContent = def ? def.displayName : "(pending curation)";
  }
  const norm = (value: number, min: number, max: number) => (value - min) / (max - min);
  handles.bars.armor.update(norm(args.stats.hpMax, 90, 200));
  handles.bars.speed.update(norm(args.stats.moveSpeed, 1.2, 2.1));
  handles.bars.guard.update(norm(args.stats.guardMax, 30, 110));
  handles.bars.power.update(norm(args.stats.powerMax, 60, 120));
  handles.bars.specialCost.update(1 - norm(args.stats.specialCost, 25, 60));

  handles.assemblyStatus.textContent = args.assemblyStatusLine;
  handles.assemblyStatus.classList.toggle("is-ok", args.assemblyReady);
  handles.assemblyStatus.classList.toggle("is-bad", !args.assemblyReady);
  handles.lockButton.disabled = !args.assemblyReady || !args.catalogReady;

  // Asset passport: provenance lines straight from the curation records.
  handles.passport.textContent = "";

  // Keep the visible family identity separate from the optional Robotcand
  // fallback. This is a provenance/claim boundary, not a second part entry:
  // every slot card below maps to a real typed GLB in the mounted assembly.
  const shellCard = el("div", "mech-passport-card");
  shellCard.dataset.testid = "visual-shell-passport";
  const shellHead = el("div", "mech-passport-head");
  shellHead.textContent = VISUAL_SHELL_PASSPORT.name;
  shellCard.appendChild(shellHead);
  for (const text of [VISUAL_SHELL_PASSPORT.asset, VISUAL_SHELL_PASSPORT.provenance, VISUAL_SHELL_PASSPORT.boundary]) {
    const line = el("div", "mech-passport-line");
    line.textContent = text;
    shellCard.appendChild(line);
  }
  handles.passport.appendChild(shellCard);

  if (!args.catalogReady) {
    const line = el("div", "mech-passport-line is-warn");
    line.textContent = "Part curation spike pending - mount disabled.";
    handles.passport.appendChild(line);
    return;
  }
  for (const part of selectedParts(args.selection)) {
    const card = el("div", "mech-passport-card");
    const head = el("div", "mech-passport-head");
    head.textContent = part.slot.toUpperCase() + ": " + part.displayName;
    const lines = [
      part.provenance.title + " - " + part.provenance.source,
      part.provenance.author + " - " + part.provenance.license
    ];
    card.appendChild(head);
    for (const text of lines) {
      const line = el("div", "mech-passport-line");
      line.textContent = text;
      card.appendChild(line);
    }
    handles.passport.appendChild(card);
  }
}

export interface ArenaHudHandles {
  readonly root: HTMLElement;
  readonly hpPlayer: ReturnType<typeof createBar>;
  readonly hpRival: ReturnType<typeof createBar>;
  readonly guardPlayer: ReturnType<typeof createBar>;
  readonly guardRival: ReturnType<typeof createBar>;
  readonly powerPlayer: ReturnType<typeof createBar>;
  readonly powerRival: ReturnType<typeof createBar>;
  readonly aggressionCard: HTMLElement;
  readonly boutCard: HTMLElement;
  readonly koCard: HTMLElement;
  readonly controlsHint: HTMLElement;
  readonly playerIdentity: HTMLElement;
  readonly rivalIdentity: HTMLElement;
}

const HINT_TEXT =
  "A/D move - SPACE jump-thrust - J/K light/heavy - L special - SHIFT guard - P pause - R rematch";

export function setupArenaHud(host: HTMLElement): ArenaHudHandles {
  const hpPlayer = createBar({ label: "YOU", value: 0, fraction: 1, testId: "hp-player-bar" });
  const hpRival = createBar({ label: "RIVAL", value: 0, fraction: 1, testId: "hp-rival-bar" });
  const guardPlayer = createBar({ label: "GUARD", value: 0, fraction: 1, testId: "guard-player-bar" });
  const guardRival = createBar({ label: "GUARD", value: 0, fraction: 1, testId: "guard-rival-bar" });
  const powerPlayer = createBar({ label: "POWER", value: 0, fraction: 1, testId: "power-player-bar" });
  const powerRival = createBar({ label: "POWER", value: 0, fraction: 1, testId: "power-rival-bar" });
  hpPlayer.root.classList.add("is-player");
  hpRival.root.classList.add("is-rival");

  const topRow = el("div", "mech-arena-bars");
  const leftCol = el("div", "mech-arena-col");
  const rightCol = el("div", "mech-arena-col is-right");
  // The two fighters use the same authored MH-2M family but different typed
  // selections. These labels make player/rival identity explicit while the
  // visible chassis/arms/legs/weapon sockets remain the actual subjects.
  const playerIdentity = el("div", "mech-fighter-identity mech-section-title");
  playerIdentity.dataset.testid = "fighter-player-identity";
  playerIdentity.textContent = "YOU // SELECTED MH-2M LOADOUT";
  const rivalIdentity = el("div", "mech-fighter-identity mech-section-title");
  rivalIdentity.dataset.testid = "fighter-rival-identity";
  rivalIdentity.textContent = "RIVAL // BULWARK FIXED MH-2M LOADOUT";
  leftCol.append(playerIdentity, hpPlayer.root, guardPlayer.root, powerPlayer.root);
  rightCol.append(rivalIdentity, hpRival.root, guardRival.root, powerRival.root);
  topRow.append(leftCol, rightCol);

  const aggressionCard = el("div", "mech-aggression-card");
  aggressionCard.dataset.testid = "aggression-card";
  const boutCard = el("div", "mech-bout-card");
  boutCard.dataset.testid = "bout-card";
  const koCard = el("div", "mech-ko-card");
  koCard.dataset.testid = "ko-card";
  koCard.setAttribute("role", "status");

  const controlsHint = el("div", "mech-controls-hint");
  controlsHint.textContent = HINT_TEXT;

  host.append(topRow, aggressionCard, boutCard, koCard, controlsHint);
  return {
    root: host,
    hpPlayer,
    hpRival,
    guardPlayer,
    guardRival,
    powerPlayer,
    powerRival,
    aggressionCard,
    boutCard,
    koCard,
    controlsHint,
    playerIdentity,
    rivalIdentity
  };
}

export function updateArenaHud(
  handles: ArenaHudHandles,
  args: {
    playerHpFraction: number;
    rivalHpFraction: number;
    playerGuardFraction: number;
    rivalGuardFraction: number;
    playerPowerFraction: number;
    rivalPowerFraction: number;
    preset: AggressionPreset;
    boutIndex: number;
    phase: string;
  }
): void {
  handles.hpPlayer.update(args.playerHpFraction);
  handles.hpRival.update(args.rivalHpFraction);
  handles.guardPlayer.update(args.playerGuardFraction);
  handles.guardRival.update(args.rivalGuardFraction);
  handles.powerPlayer.update(args.playerPowerFraction);
  handles.powerRival.update(args.rivalPowerFraction);
  handles.aggressionCard.textContent = "REMATCH " + (args.boutIndex + 1) + " - RIVAL " + args.preset.label;
  handles.aggressionCard.dataset.preset = args.preset.id;
  handles.boutCard.textContent = args.phase.toUpperCase();
}

export function showKoCard(handles: ArenaHudHandles, won: boolean, preset: AggressionPreset): void {
  handles.koCard.textContent = won ? "KO! YOU WIN" : "KNOCKED OUT";
  handles.koCard.dataset.visible = "true";
  handles.koCard.dataset.result = won ? "win" : "loss";
  const sub = el("div", "mech-ko-sub");
  sub.textContent = "R rematch (" + nextPresetLabel(preset) + ") - BACKSPACE hangar";
  handles.koCard.appendChild(sub);
}

function nextPresetLabel(current: AggressionPreset): string {
  return current.id === "keep-away" ? "balanced 0.55" : current.id === "balanced" ? "rushdown 0.8" : "keep-away 0.35";
}

export function hideKoCard(handles: ArenaHudHandles): void {
  handles.koCard.dataset.visible = "false";
  handles.koCard.textContent = "";
}

export function setArenaVisible(handles: ArenaHudHandles, visible: boolean): void {
  handles.root.style.display = visible ? "" : "none";
}

export function setHangarVisible(handles: HangarHudHandles, visible: boolean): void {
  handles.root.style.display = visible ? "" : "none";
}
