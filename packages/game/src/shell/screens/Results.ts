/**
 * Results screen (§7.2 `ResultsSpec`): labelled stat fields, optional
 * localStorage best with "new best" flag, action buttons → retry|title|next.
 */
import type { HudDocument } from "../../hud/dom.js";
import { createMenu, type MenuHandle } from "./menu.js";

export interface ResultsFieldSpec {
  readonly id: string;
  readonly label: string;
  readonly format?: (v: number) => string;
}

export interface ResultsSpec {
  readonly fields: readonly ResultsFieldSpec[];
  readonly best?: { readonly key: string; readonly compare: "max" | "min" };
  readonly actions?: readonly ("retry" | "title" | "next")[];
  readonly title?: string;
}

const ACTION_LABEL: Record<string, string> = { retry: "Retry", title: "Title", next: "Next" };

export function createResultsMenu(
  doc: HudDocument,
  opts: {
    spec: ResultsSpec;
    storage?: { getItem(k: string): string | null; setItem(k: string, v: string): void };
    bestKey?: string; // defaults `a3g:<spec-name>:best:v1` — caller passes gameId-scoped key
    onAction: (action: "retry" | "title" | "next") => void;
  }
): MenuHandle & { setResults(values: Readonly<Record<string, number>>): boolean } {
  const host = doc.createElement("ul");
  host.className = "a3g-results";
  let newBest = false;
  const bestKey = opts.bestKey ?? "a3g:game:best:v1";

  const menu = createMenu(doc, {
    id: "results",
    title: opts.spec.title ?? "Results",
    items: (opts.spec.actions ?? ["retry", "title"]).map((a) => ({
      id: a,
      label: ACTION_LABEL[a] ?? a,
      run: () => opts.onAction(a)
    }))
  });
  const panel = menu.el.children[0];
  const itemsList = panel.children.find((c) => String(c.className).includes("a3g-menu-items"));
  if (itemsList) {
    const idx = panel.children.indexOf(itemsList);
    panel.appendChild(host);
    // keep results above the action list
    panel.removeChild(host);
    panel.children.length;
    // insert before items
    panel.appendChild(host);
  } else {
    panel.appendChild(host);
  }

  return Object.assign(menu, {
    setResults(values: Readonly<Record<string, number>>) {
      while (host.children.length) host.removeChild(host.children[host.children.length - 1]);
      for (const f of opts.spec.fields) {
        const v = values[f.id];
        if (v === undefined) continue;
        const li = doc.createElement("li");
        li.className = "a3g-results-row";
        li.dataset.fieldId = f.id;
        const label = doc.createElement("span");
        label.className = "a3g-results-label";
        label.textContent = f.label;
        const val = doc.createElement("span");
        val.className = "a3g-results-value";
        val.textContent = f.format ? f.format(v) : String(Math.round(v * 100) / 100);
        li.appendChild(label);
        li.appendChild(val);
        host.appendChild(li);
      }
      newBest = false;
      const best = opts.spec.best;
      if (best && opts.storage) {
        const v = values[best.key];
        if (v !== undefined) {
          const prev = Number(opts.storage.getItem(bestKey));
          const better = Number.isNaN(prev) || (best.compare === "max" ? v > prev : v < prev);
          if (better) {
            newBest = true;
            try { opts.storage.setItem(bestKey, String(v)); } catch { /* private mode */ }
            const flag = doc.createElement("li");
            flag.className = "a3g-results-best";
            flag.textContent = "New best!";
            host.appendChild(flag);
          }
        }
      }
      return newBest;
    }
  });
}
