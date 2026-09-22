import { expect, type Page } from "@playwright/test";

/*
 * Shared mobile touch contract (§25).
 *
 * A route can pass every desktop test while being unplayable on a phone:
 * controls pushed below the fold of a side panel, amputated by an
 * `overflow:hidden` ancestor, or rendered at 20px where a thumb needs 44.
 * "The button exists in the DOM" is not the bar - a player has to be able to
 * hit it while the game is live. So each route asserts both halves:
 *
 *   1. geometry  - the control is inside the visual viewport, unclipped, and
 *                  at least 44x44 CSS px (Apple HIG / WCAG 2.5.5 minimum).
 *   2. authority - tapping it changes *game state*, read back through the
 *                  route's own evidence object rather than body text, which
 *                  drifts on its own whenever anything animates.
 */

export const PHONE_VIEWPORT = { width: 390, height: 844 };

export const PHONE_CONTEXT_OPTIONS = {
  viewport: PHONE_VIEWPORT,
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 2,
} as const;

export interface TouchControl {
  /** Stable selector for the control element. */
  selector: string;
  /** Human-readable name used in failure messages. */
  label: string;
}

/** Smallest area a thumb can be expected to hit reliably. */
const MIN_TAP_PX = 44;

/**
 * Prove each control is actually reachable on a phone: on screen, not clipped,
 * not parked under a scrollable panel, and big enough to hit.
 *
 * Reports which ancestor is responsible, because "off screen" and "hidden
 * behind a panel that would need scrolling mid-action" read the same in a
 * screenshot but need different fixes.
 */
export async function expectTouchControlsReachable(page: Page, controls: TouchControl[]): Promise<void> {
  const vp = page.viewportSize() ?? PHONE_VIEWPORT;
  const measured = await page.evaluate(
    ({ selectors, vw, vh }) =>
      selectors.map((selector) => {
        const el = document.querySelector(selector) as HTMLElement | null;
        if (!el) return { selector, found: false as const };
        const rect = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const inViewport =
          rect.top >= -1 && rect.left >= -1 && rect.bottom <= vh + 1 && rect.right <= vw + 1;
        let blocker: string | null = null;
        for (let p = el.parentElement; p; p = p.parentElement) {
          const pr = p.getBoundingClientRect();
          const pcs = getComputedStyle(p);
          const past = rect.bottom > pr.bottom + 1 || rect.right > pr.right + 1;
          if (!past) continue;
          if (/auto|scroll/.test(pcs.overflowY) && p.scrollHeight > p.clientHeight + 1) {
            blocker = `scrollable-ancestor #${p.id || p.className}`;
            break;
          }
          if (/hidden|clip/.test(pcs.overflow)) {
            blocker = `clipped-by #${p.id || p.className}`;
            break;
          }
        }
        return {
          selector,
          found: true as const,
          rect: {
            top: Math.round(rect.top),
            bottom: Math.round(rect.bottom),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
          visible: cs.display !== "none" && cs.visibility !== "hidden" && cs.opacity !== "0",
          inViewport,
          blocker,
        };
      }),
    { selectors: controls.map((c) => c.selector), vw: vp.width, vh: vp.height },
  );

  const problems: string[] = [];
  measured.forEach((m, i) => {
    const label = `${controls[i].label} (${controls[i].selector})`;
    if (!m.found) return problems.push(`${label} is not in the DOM`);
    if (!m.visible) return problems.push(`${label} is present but not visible`);
    if (m.blocker) return problems.push(`${label} needs scrolling past ${m.blocker}`);
    if (!m.inViewport) {
      return problems.push(`${label} sits at y=${m.rect.top}..${m.rect.bottom}, outside the ${vp.height}px viewport`);
    }
    if (m.rect.width < MIN_TAP_PX || m.rect.height < MIN_TAP_PX) {
      return problems.push(`${label} is ${m.rect.width}x${m.rect.height}, below the ${MIN_TAP_PX}px tap minimum`);
    }
  });

  expect(problems, `touch controls unreachable on ${vp.width}x${vp.height}`).toEqual([]);
}

/**
 * Tap a control with a real touch at its centre. Returns false when the
 * element has no box, so a spec can fail with a useful message instead of
 * Playwright throwing on NaN coordinates.
 */
export async function tapControl(page: Page, selector: string): Promise<boolean> {
  const box = await page.locator(selector).boundingBox();
  if (!box) return false;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  return true;
}

function pointerEvent(
  page: Page,
  selector: string,
  type: "pointerdown" | "pointerup",
): Promise<boolean> {
  return page.evaluate(
    ({ selector, type }) => {
      const el = document.querySelector(selector);
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      el.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: rect.x + rect.width / 2,
          clientY: rect.y + rect.height / 2,
          pointerId: 1,
          isPrimary: true,
        }),
      );
      return true;
    },
    { selector, type },
  );
}

/** Press and hold a control without releasing, so a spec can read state mid-hold. */
export async function pressControl(page: Page, selector: string): Promise<boolean> {
  if (!(await page.locator(selector).boundingBox())) return false;
  return pointerEvent(page, selector, "pointerdown");
}

/** Release a control previously held with `pressControl`. */
export async function releaseControl(page: Page, selector: string): Promise<boolean> {
  return pointerEvent(page, selector, "pointerup");
}

/**
 * Hold a control for `frames` route-driven frames, then release.
 *
 * Movement, sneak and lift are read inside the frame loop, and headless rAF
 * throttling makes wall-clock waits useless for them, so the caller supplies
 * the route's deterministic pump. A tap that lands and releases between two
 * frames proves nothing about a hold-style verb. Use `pressControl` directly
 * when the state you assert only exists *while* the finger is down.
 */
export async function holdControl(
  page: Page,
  selector: string,
  frames: number,
  advance: (frames: number) => Promise<void>,
): Promise<boolean> {
  if (!(await pressControl(page, selector))) return false;
  try {
    await advance(frames);
  } finally {
    await releaseControl(page, selector);
  }
  return true;
}

