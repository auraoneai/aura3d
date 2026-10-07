/**
 * Settings menu (§6.3): per-bus volume sliders, reduced motion/flash, high
 * contrast, quality tier. Persisted to `a3g:<id>:settings:v1` (v1 = schema
 * version; older versions are discarded).
 */
import type { HudDocument, HudElement } from "../../hud/dom.js";
import { createMenu, type MenuHandle } from "./menu.js";

export const AUDIO_BUSES = ["master", "music", "sfx", "ui", "ambience", "voice"] as const;
export type AudioBus = (typeof AUDIO_BUSES)[number];

export interface GameSettings {
  volume: Partial<Record<AudioBus, number>>;
  reducedMotion?: boolean;
  reducedFlash?: boolean;
  highContrast?: boolean;
  quality?: string;
}

export interface SettingsActions {
  setBusVolume?(bus: AudioBus, v: number): void;
  setReducedMotion?(on: boolean): void;
  setReducedFlash?(on: boolean): void;
  setHighContrast?(on: boolean): void;
  setQuality?(tier: string): void;
}

export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function settingsKey(gameId: string): string {
  return `a3g:${gameId}:settings:v1`;
}

export function loadSettings(storage: SettingsStorage | undefined, gameId: string): GameSettings {
  if (!storage) return { volume: {} };
  try {
    const raw = storage.getItem(settingsKey(gameId));
    if (!raw) return { volume: {} };
    const parsed = JSON.parse(raw) as GameSettings;
    return { ...parsed, volume: parsed.volume ?? {} };
  } catch {
    return { volume: {} };
  }
}

export function saveSettings(storage: SettingsStorage | undefined, gameId: string, s: GameSettings): void {
  try {
    storage?.setItem(settingsKey(gameId), JSON.stringify(s));
  } catch { /* private mode */ }
}

function row(doc: HudDocument, label: string): { li: HudElement; ctl: HudElement } {
  const li = doc.createElement("li");
  li.className = "a3g-setting-row";
  const l = doc.createElement("span");
  l.className = "a3g-setting-label";
  l.textContent = label;
  li.appendChild(l);
  const ctl = doc.createElement("input");
  ctl.setAttribute("tabindex", "-1");
  li.appendChild(ctl);
  return { li, ctl };
}

export function createSettingsMenu(
  doc: HudDocument,
  opts: {
    gameId: string;
    storage?: SettingsStorage;
    actions: SettingsActions;
    sections?: { audio?: boolean; accessibility?: boolean; controls?: boolean; quality?: boolean };
    qualityTiers?: readonly string[];
    onClose?: () => void;
  }
): MenuHandle & { settings(): GameSettings } {
  let settings = loadSettings(opts.storage, opts.gameId);
  const sections = { audio: true, accessibility: true, controls: false, quality: true, ...opts.sections };

  // Build once as menu items so roving tabindex covers every control row.
  const rows: { li: HudElement; ctl: HudElement; apply(): void }[] = [];
  const items = [] as { id: string; label: string; run: () => void }[];
  const extraList = doc.createElement("ul");
  extraList.className = "a3g-settings";

  if (sections.audio) {
    for (const bus of AUDIO_BUSES) {
      const { li, ctl } = row(doc, `${bus} volume`);
      ctl.setAttribute("type", "range");
      ctl.setAttribute("min", "0");
      ctl.setAttribute("max", "1");
      ctl.setAttribute("step", "0.05");
      ctl.setAttribute("value", String(settings.volume[bus] ?? 1));
      ctl.dataset.setting = `volume.${bus}`;
      ctl.addEventListener("input", (ev) => {
        const v = Number((ev as { target?: { value?: string } }).target?.value ?? 1);
        settings = { ...settings, volume: { ...settings.volume, [bus]: v } };
        opts.actions.setBusVolume?.(bus, v);
        saveSettings(opts.storage, opts.gameId, settings);
      });
      rows.push({ li, ctl, apply() {} });
      extraList.appendChild(li);
    }
  }
  if (sections.accessibility) {
    for (const [key, label] of [
      ["reducedMotion", "Reduced motion"],
      ["reducedFlash", "Reduced flash"],
      ["highContrast", "High contrast"]
    ] as const) {
      const { li, ctl } = row(doc, label);
      ctl.setAttribute("type", "checkbox");
      if (settings[key]) ctl.setAttribute("checked", "");
      ctl.dataset.setting = key;
      ctl.addEventListener("change", (ev) => {
        const on = Boolean((ev as { target?: { checked?: boolean } }).target?.checked);
        settings = { ...settings, [key]: on };
        if (key === "reducedMotion") opts.actions.setReducedMotion?.(on);
        if (key === "reducedFlash") opts.actions.setReducedFlash?.(on);
        if (key === "highContrast") opts.actions.setHighContrast?.(on);
        saveSettings(opts.storage, opts.gameId, settings);
      });
      rows.push({ li, ctl, apply() {} });
      extraList.appendChild(li);
    }
  }
  if (sections.quality && opts.qualityTiers?.length) {
    const { li, ctl } = row(doc, "Quality");
    const sel = doc.createElement("select");
    for (const tier of opts.qualityTiers) {
      const o = doc.createElement("option");
      o.setAttribute("value", tier);
      o.textContent = tier;
      sel.appendChild(o);
    }
    if (settings.quality) sel.setAttribute("value", settings.quality);
    ctl.remove();
    sel.setAttribute("tabindex", "-1");
    sel.dataset.setting = "quality";
    li.appendChild(sel);
    sel.addEventListener("change", (ev) => {
      const v = (ev as { target?: { value?: string } }).target?.value ?? "high";
      settings = { ...settings, quality: v };
      opts.actions.setQuality?.(v);
      saveSettings(opts.storage, opts.gameId, settings);
    });
    rows.push({ li, ctl: sel, apply() {} });
    extraList.appendChild(li);
  }

  const menu = createMenu(doc, {
    id: "settings",
    title: "Settings",
    items: [...items, { id: "back", label: "Back", run: () => opts.onClose?.() }]
  });
  // Settings rows live inside the menu panel, above the item list.
  const panel = menu.el.children[0];
  const list = panel.children.find((c) => String(c.className).includes("a3g-menu-items"));
  if (list) panel.appendChild(extraList);
  else panel.appendChild(extraList);
  menu.onClose = () => opts.onClose?.();
  return Object.assign(menu, { settings: () => settings });
}
