/** Pause menu (§7.2): default items resume/restart/settings/about/quit-to-title. */
import type { HudDocument } from "../../hud/dom.js";
import { createMenu, type MenuHandle, type MenuItemSpec } from "./menu.js";

export type PauseMenuItem = MenuItemSpec;

export const DEFAULT_PAUSE_ITEMS: readonly MenuItemSpec[] = [
  { id: "resume", label: "Resume", hint: "Esc" },
  { id: "restart", label: "Restart" },
  { id: "settings", label: "Settings" },
  { id: "about", label: "About" },
  { id: "quit-to-title", label: "Quit to title" }
];

export function createPauseMenu(
  doc: HudDocument,
  opts: { items?: readonly MenuItemSpec[]; title?: string; onAction: (id: string) => void }
): MenuHandle {
  const items = (opts.items ?? DEFAULT_PAUSE_ITEMS).map((i) => ({
    ...i,
    run: () => {
      if (i.run) return i.run();
      opts.onAction(i.id);
    }
  }));
  return createMenu(doc, { id: "pause", title: opts.title ?? "Paused", items });
}
