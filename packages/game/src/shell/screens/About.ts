/** About screen (§6.2): route prose/marketing lives here, never in play view. */
import type { HudDocument } from "../../hud/dom.js";
import { createMenu, type MenuHandle } from "./menu.js";

export function createAboutMenu(
  doc: HudDocument,
  opts: { html: string; onClose?: () => void }
): MenuHandle {
  const menu = createMenu(doc, {
    id: "about",
    title: "About",
    items: [{ id: "back", label: "Back", run: () => opts.onClose?.() }]
  });
  const panel = menu.el.children[0];
  const body = doc.createElement("div");
  body.className = "a3g-about-body";
  // About is the one sanctioned place authored route markup lands (§6.2);
  // the shell inserts it as the menu body.
  body.innerHTML = opts.html;
  const list = panel.children.find((c) => String(c.className).includes("a3g-menu-items"));
  if (list) {
    // Insert body before the item list.
    panel.appendChild(body);
  } else {
    panel.appendChild(body);
  }
  menu.onClose = () => opts.onClose?.();
  return menu;
}
