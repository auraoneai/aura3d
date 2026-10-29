import { defaultBindings, keyLabel, rebind, REBINDABLE_ACTIONS, saveBindings, type ActionId, type BindingMap } from "./controls";

/**
 * Controls sheet (audit IC-14): lists each fight action with its keyboard key, rebinds on click + key press, and saves the
 * result to localStorage. It writes straight into the input controller's live action map, which the controller reads on
 * every lookup, so a rebind takes effect on the next frame.
 */
export interface ControlsSheet {
  render(): void;
  cancelListening(): void;
  readonly listening: boolean;
}

export function mountControlsSheet(
  doc: Document,
  options: {
    readonly actions: Record<string, string[]>;
    readonly storage: Storage | undefined;
    readonly onChange: () => void;
    readonly onBack: () => void;
  }
): ControlsSheet {
  const list = doc.getElementById("controls-list");
  const reset = doc.getElementById("controls-reset");
  const back = doc.getElementById("controls-back");
  let listeningFor: ActionId | null = null;

  const current = (): BindingMap => {
    const map = defaultBindings();
    for (const id of Object.keys(map) as ActionId[]) if (options.actions[id]) map[id] = [...options.actions[id]!];
    return map;
  };
  const apply = (map: BindingMap | null): void => {
    const next = map ?? defaultBindings();
    for (const [id, codes] of Object.entries(next)) options.actions[id] = [...codes];
    saveBindings(options.storage, map);
    options.onChange();
  };

  function render(): void {
    if (!list) return;
    list.textContent = "";
    for (const { id, label } of REBINDABLE_ACTIONS) {
      const row = doc.createElement("div");
      row.className = "ic-controls-row";
      row.setAttribute("role", "listitem");
      const name = doc.createElement("span");
      name.textContent = label;
      const key = doc.createElement("button");
      key.type = "button";
      key.dataset.rebind = id;
      const code = options.actions[id]?.find((c) => !c.startsWith("Gamepad"));
      key.textContent = listeningFor === id ? "Press a key…" : keyLabel(code);
      key.setAttribute("aria-pressed", String(listeningFor === id));
      key.addEventListener("click", () => {
        listeningFor = id;
        render();
      });
      const pad = doc.createElement("small");
      pad.textContent = (options.actions[id] ?? []).filter((c) => c.startsWith("Gamepad")).map((c) => c.replace(/^Gamepad/, "")).join(" ") || "—";
      row.append(name, key, pad);
      list.append(row);
    }
  }

  doc.addEventListener(
    "keydown",
    (ev) => {
      if (listeningFor === null) return;
      ev.preventDefault();
      ev.stopPropagation();
      const action = listeningFor;
      listeningFor = null;
      if (ev.code !== "Escape") apply(rebind(current(), action, ev.code));
      render();
    },
    true
  );
  reset?.addEventListener("click", () => {
    listeningFor = null;
    apply(null);
    render();
  });
  back?.addEventListener("click", () => {
    listeningFor = null;
    options.onBack();
  });

  return {
    render,
    cancelListening() {
      listeningFor = null;
    },
    get listening() {
      return listeningFor !== null;
    }
  };
}
