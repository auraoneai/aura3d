// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

export type AuraUiTarget<TElement extends HTMLElement = HTMLElement> = string | TElement;

function resolveUiElement<TElement extends HTMLElement>(target: AuraUiTarget<TElement>, label: string): TElement {
  if (typeof target !== "string") return target;
  const element = document.querySelector<TElement>(target);
  if (!element) throw new Error(`Aura3D UI helper could not find ${label}: ${target}`);
  return element;
}

export const ui = {
  root: (selector = "#app"): HTMLElement => resolveUiElement<HTMLElement>(selector, "root"),
  text: (selector: string): HTMLElement => resolveUiElement<HTMLElement>(selector, "text"),
  button: (selector: string): HTMLButtonElement => resolveUiElement<HTMLButtonElement>(selector, "button"),
  html: (target: AuraUiTarget, markup: string, position: InsertPosition = "beforeend"): HTMLElement => {
    const element = resolveUiElement<HTMLElement>(target, "html mount");
    element.insertAdjacentHTML(position, markup);
    return element;
  },
  setText: (target: AuraUiTarget, value: string | number): void => {
    resolveUiElement<HTMLElement>(target, "text").textContent = String(value);
  },
  setPressed: (target: AuraUiTarget<HTMLButtonElement>, pressed: boolean): void => {
    const button = resolveUiElement<HTMLButtonElement>(target, "button");
    button.setAttribute("aria-pressed", String(pressed));
  },
	  onClick: (target: AuraUiTarget<HTMLButtonElement>, handler: (button: HTMLButtonElement, event: MouseEvent) => void): HTMLButtonElement => {
	    const button = resolveUiElement<HTMLButtonElement>(target, "button");
	    button.onclick = (event) => handler(button, event);
	    return button;
	  },
	  range: (selector: string): HTMLInputElement => resolveUiElement<HTMLInputElement>(selector, "range input"),
	  onInput: (target: AuraUiTarget<HTMLInputElement>, handler: (input: HTMLInputElement, event: Event) => void): HTMLInputElement => {
	    const input = resolveUiElement<HTMLInputElement>(target, "range input");
	    input.oninput = (event) => handler(input, event);
	    return input;
	  },
  scoreCounter: (target: AuraUiTarget, options: { readonly initial?: number; readonly label?: string } = {}): { readonly element: HTMLElement; get value(): number; set(value: number): void; increment(amount?: number): number } => {
    const element = resolveUiElement<HTMLElement>(target, "score counter");
    let value = options.initial ?? 0;
    const label = options.label ?? "score";
    const render = () => {
      element.dataset.aura3dScoreCounter = "true";
      element.textContent = `${label}: ${value}`;
    };
    render();
    return {
      element,
      get value() {
        return value;
      },
      set(next) {
        value = next;
        render();
      },
      increment(amount = 1) {
        value += amount;
        render();
        return value;
      }
    };
  },
  powerMeter: (target: AuraUiTarget<HTMLInputElement>, options: { readonly min?: number; readonly max?: number; readonly value?: number } = {}): HTMLInputElement => {
    const input = resolveUiElement<HTMLInputElement>(target, "power meter");
    input.type = "range";
    input.min = String(options.min ?? 0);
    input.max = String(options.max ?? 100);
    input.value = String(options.value ?? 50);
    input.dataset.aura3dPowerMeter = "true";
    return input;
  },
  slider: (target: AuraUiTarget<HTMLInputElement>, options: { readonly min?: number; readonly max?: number; readonly value?: number; readonly metric?: string } = {}): HTMLInputElement => {
    const input = resolveUiElement<HTMLInputElement>(target, "slider");
    input.type = "range";
    input.min = String(options.min ?? 0);
    input.max = String(options.max ?? 100);
    input.value = String(options.value ?? 50);
    input.dataset.aura3dSlider = "true";
    if (options.metric) input.dataset.aura3dMetric = options.metric;
    return input;
  },
  resetButton: (target: AuraUiTarget<HTMLButtonElement>, handler?: (button: HTMLButtonElement, event: MouseEvent) => void): HTMLButtonElement => {
    const button = resolveUiElement<HTMLButtonElement>(target, "reset button");
    button.dataset.aura3dResetButton = "true";
    if (handler) button.onclick = (event) => handler(button, event);
    return button;
  },
  hoverReadout: (target: AuraUiTarget, value = "none"): HTMLElement => {
    const element = resolveUiElement<HTMLElement>(target, "hover readout");
    element.dataset.aura3dHoverReadout = "true";
    element.textContent = value;
    return element;
  },
  toggle: (target: AuraUiTarget<HTMLButtonElement>, options: { readonly pressed?: boolean; readonly onLabel?: string; readonly offLabel?: string } = {}): HTMLButtonElement => {
    const button = resolveUiElement<HTMLButtonElement>(target, "toggle");
    const pressed = options.pressed ?? false;
    button.setAttribute("aria-pressed", String(pressed));
    button.textContent = pressed ? options.onLabel ?? "on" : options.offLabel ?? "off";
    button.dataset.aura3dStateToggle = "true";
    return button;
  }
} as const;
