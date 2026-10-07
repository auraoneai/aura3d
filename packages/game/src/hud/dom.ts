/**
 * Structural DOM subset the HUD kit renders against — satisfied by the real
 * `document`/`HTMLElement` in the browser and by a fake in node tests. No
 * `innerHTML` is written after mount (PRD-09 1758).
 */
export interface HudClassList {
  add(...names: string[]): void;
  remove(...names: string[]): void;
  toggle(name: string, force?: boolean): void;
  contains(name: string): boolean;
}

export interface HudRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface HudElement {
  tagName: string;
  className: string;
  textContent: string | null;
  innerHTML: string;
  readonly style: Record<string, string>;
  readonly dataset: Record<string, string>;
  readonly classList: HudClassList;
  readonly children: readonly HudElement[];
  appendChild(child: HudElement): void;
  removeChild(child: HudElement): void;
  remove(): void;
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  addEventListener(type: string, cb: (ev: unknown) => void): void;
  removeEventListener(type: string, cb: (ev: unknown) => void): void;
  getBoundingClientRect(): HudRect;
}

export interface HudDocument {
  createElement(tag: string): HudElement;
  createTextNode(text: string): HudElement;
  body: HudElement;
}

/** Structural RAF handle — matches requestAnimationFrame/cancelAnimationFrame. */
export interface HudScheduler {
  (cb: () => void): { cancel(): void };
}

export function rafScheduler(win: { requestAnimationFrame(cb: FrameRequestCallback): number; cancelAnimationFrame(id: number): void }): HudScheduler {
  return (cb) => {
    const id = win.requestAnimationFrame(() => cb());
    return { cancel: () => win.cancelAnimationFrame(id) };
  };
}
