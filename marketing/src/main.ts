import "./styles.css";

// ─────────────────────────────────────────────────────────────
// Homepage interactions
// ─────────────────────────────────────────────────────────────
// Demos are poster-first. No iframe gets a src until a visitor
// presses Play; that same action enables pointer input. Page scroll
// is never captured before Play.

type DemoState = "idle" | "interactive";

const APP_BASE = (window as unknown as { APP_BASE?: string }).APP_BASE
  ?? window.location.origin;

function track(event: string, detail: Record<string, unknown> = {}): void {
  window.dispatchEvent(new CustomEvent("aura:analytics", {
    detail: { event, ...detail }
  }));
}

function isVisible(element: HTMLElement): boolean {
  return element.getClientRects().length > 0;
}

// ─────────────────────────────────────────────────────────────
// Mobile navigation drawer
// ─────────────────────────────────────────────────────────────

const header = document.querySelector<HTMLElement>(".home-header");
const menuToggle = document.querySelector<HTMLButtonElement>(".home-menu-toggle");
const navMenu = document.getElementById("home-nav-menu");
let menuOpen = false;

function menuFocusables(): HTMLElement[] {
  if (!navMenu) return [];
  return [
    ...navMenu.querySelectorAll<HTMLElement>("a[href], button:not([disabled])"),
    ...document.querySelectorAll<HTMLElement>(".home-nav-actions a[href], .home-nav-actions button")
  ].filter(isVisible);
}

function setMenu(open: boolean, returnFocus = false): void {
  if (!menuToggle || !navMenu) return;
  menuOpen = open;
  menuToggle.setAttribute("aria-expanded", String(open));
  menuToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  document.body.classList.toggle("menu-open", open);

  if (open) {
    track("nav_open");
    window.requestAnimationFrame(() => {
      navMenu.querySelector<HTMLElement>("a[href]")?.focus();
    });
  } else if (returnFocus) {
    menuToggle.focus();
  }
}

menuToggle?.addEventListener("click", () => setMenu(!menuOpen));

header?.addEventListener("click", (event) => {
  const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (!link) return;
  track("nav_link_click", {
    label: (link.textContent ?? "").trim(),
    href: link.getAttribute("href") ?? ""
  });
  if (menuOpen) setMenu(false);
});

document.addEventListener("keydown", (event) => {
  if (menuOpen) {
    if (event.key === "Escape") {
      event.preventDefault();
      setMenu(false, true);
      return;
    }
    if (event.key === "Tab") {
      const nodes = menuFocusables();
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      }
    }
    return;
  }

  if (event.key === "Escape") {
    const openStages = demos.filter((stage) => stage.dataset.demoState === "interactive");
    if (openStages.length === 0) return;
    event.preventDefault();
    for (const stage of openStages) closeDemo(stage, false);
    const play = openStages[0].querySelector<HTMLButtonElement>("[data-demo-play]");
    play?.focus();
  }
});

window.addEventListener("resize", () => {
  if (menuOpen && window.innerWidth > 1100) setMenu(false);
}, { passive: true });

// ─────────────────────────────────────────────────────────────
// Click-to-play demos
// ─────────────────────────────────────────────────────────────

const demos = [...document.querySelectorAll<HTMLElement>("[data-demo]")];
let activeDemo: HTMLElement | null = null;

function demoFrame(stage: HTMLElement): HTMLIFrameElement | null {
  return stage.querySelector<HTMLIFrameElement>("[data-demo-frame]");
}

function demoPlayButton(stage: HTMLElement): HTMLButtonElement | null {
  return stage.querySelector<HTMLButtonElement>("[data-demo-play]");
}

function setDemoState(stage: HTMLElement, state: DemoState): void {
  stage.dataset.demoState = state;
  const launch = stage.querySelector<HTMLElement>(".stage-launch");
  const controls = stage.querySelector<HTMLElement>("[data-demo-controls]");
  if (launch) launch.hidden = state !== "idle";
  if (controls) controls.hidden = state === "idle";
}

function demoUrl(route: string): string {
  const separator = route.includes("?") ? "&" : "?";
  return `${APP_BASE}${route}${separator}chrome=hidden`;
}

function playDemo(stage: HTMLElement): void {
  const frame = demoFrame(stage);
  const route = stage.dataset.demoRoute;
  if (!frame || !route) return;

  if (activeDemo && activeDemo !== stage) closeDemo(activeDemo, false);

  frame.allowFullscreen = true;
  frame.src = demoUrl(route);
  frame.tabIndex = 0;
  setDemoState(stage, "interactive");
  activeDemo = stage;

  track("cta_play_game", {
    game: stage.dataset.demoName ?? "Aura3D demo",
    route,
    placement: stage.dataset.demoKind ?? "game-card"
  });

  window.requestAnimationFrame(() => {
    frame.focus();
  });
}

function closeDemo(stage: HTMLElement, returnFocus = true): void {
  const state = stage.dataset.demoState;
  const frame = demoFrame(stage);
  if (state !== "interactive") return;

  if (frame) {
    frame.removeAttribute("src");
    frame.tabIndex = -1;
  }
  setDemoState(stage, "idle");
  if (activeDemo === stage) activeDemo = null;
  track("demo_close", { game: stage.dataset.demoName ?? "Aura3D demo" });
  if (returnFocus) demoPlayButton(stage)?.focus();
}

for (const stage of demos) {
  const frame = demoFrame(stage);
  const route = stage.dataset.demoRoute;

  stage.querySelector<HTMLButtonElement>("[data-demo-play]")?.addEventListener("click", () => {
    playDemo(stage);
  });

  stage.querySelector<HTMLButtonElement>("[data-demo-close]")?.addEventListener("click", () => {
    closeDemo(stage);
  });

  for (const link of stage.querySelectorAll<HTMLAnchorElement>("[data-demo-open]")) {
    link.addEventListener("click", () => {
      track("demo_fullscreen", {
        game: stage.dataset.demoName ?? "Aura3D demo",
        route: route ?? ""
      });
    });
  }

  frame?.addEventListener("load", () => {
    if (!frame.src) return;
    try {
      frame.contentWindow?.document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        closeDemo(stage, true);
      });
    } catch {
      // Cross-origin demo: the visible Close demo control remains available.
    }
  });
}

// ─────────────────────────────────────────────────────────────
// Copy buttons
// ─────────────────────────────────────────────────────────────

async function writeClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the textarea fallback.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-1000px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  textarea.remove();
  return copied;
}

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-copy-text], [data-copy-target]")) {
  let resetTimer: number | undefined;

  button.addEventListener("click", async () => {
    const targetSelector = button.dataset.copyTarget;
    const target = targetSelector ? document.querySelector<HTMLElement>(targetSelector) : null;
    const text = target
      ? (target.textContent ?? "").trim()
      : (button.dataset.copyText ?? "");
    const label = button.querySelector<HTMLElement>("[data-copy-label]");
    const originalLabel = button.dataset.copyLabel ?? label?.textContent ?? "Copy";
    button.dataset.copyLabel = originalLabel;

    const copied = await writeClipboard(text);
    if (label) label.textContent = copied ? "Copied" : "Copy failed";
    button.classList.toggle("is-copied", copied);

    if (copied) {
      if (button.classList.contains("copy-btn")) {
        track("cta_install_copy", { command: text });
      } else {
        track("code_copy", { target: targetSelector ?? "inline" });
      }
    }

    if (resetTimer) window.clearTimeout(resetTimer);
    resetTimer = window.setTimeout(() => {
      if (label) label.textContent = originalLabel;
      button.classList.remove("is-copied");
    }, 1800);
  });
}

// ─────────────────────────────────────────────────────────────
// Docs search — results appear only after typing
// ─────────────────────────────────────────────────────────────

const searchRoot = document.querySelector<HTMLElement>("[data-docs-search]");
const searchInput = searchRoot?.querySelector<HTMLInputElement>("[data-docs-search-input]");
const searchResults = searchRoot?.querySelector<HTMLElement>("[data-docs-search-results]");
const searchStatus = searchRoot?.querySelector<HTMLElement>("[data-docs-search-status]");
const searchEmpty = searchRoot?.querySelector<HTMLElement>("[data-docs-search-empty]");
const searchItems = searchRoot
  ? [...searchRoot.querySelectorAll<HTMLElement>("[data-search-item]")]
  : [];
let searchTrackTimer: number | undefined;

function updateSearch(): void {
  if (!searchInput || !searchResults || !searchStatus) return;
  const rawQuery = searchInput.value.trim();
  const query = rawQuery.toLowerCase();

  if (!query) {
    searchResults.hidden = true;
    searchStatus.textContent = "";
    if (searchEmpty) searchEmpty.hidden = true;
    for (const item of searchItems) item.hidden = false;
    if (searchTrackTimer) window.clearTimeout(searchTrackTimer);
    return;
  }

  let matches = 0;
  for (const item of searchItems) {
    const link = item.querySelector<HTMLAnchorElement>("a[href]");
    const haystack = `${link?.textContent ?? ""} ${link?.dataset.searchTerms ?? ""}`.toLowerCase();
    const match = haystack.includes(query);
    item.hidden = !match;
    if (match) matches += 1;
  }

  searchResults.hidden = false;
  if (searchEmpty) searchEmpty.hidden = matches > 0;
  searchStatus.textContent = matches === 0
    ? `No docs match “${rawQuery}”.`
    : `${matches} ${matches === 1 ? "doc matches" : "docs match"} “${rawQuery}”.`;

  if (searchTrackTimer) window.clearTimeout(searchTrackTimer);
  searchTrackTimer = window.setTimeout(() => {
    track("docs_search_query", { query: rawQuery, results: matches });
  }, 500);
}

searchInput?.addEventListener("input", updateSearch);

// ─────────────────────────────────────────────────────────────
// Lightweight analytics bridge + scroll depth
// ─────────────────────────────────────────────────────────────

for (const element of document.querySelectorAll<HTMLElement>("[data-analytics]")) {
  element.addEventListener("click", () => {
    track(element.dataset.analytics ?? "interaction", {
      label: (element.textContent ?? "").trim()
    });
  });
}

document.addEventListener("click", (event) => {
  const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
  if (!anchor) return;
  const href = anchor.getAttribute("href") ?? "";
  if (!/^https?:\/\//.test(href)) return;
  try {
    const host = new URL(href, window.location.href).hostname;
    if (host === "github.com" || host === "www.npmjs.com" || host === "opensource.org") {
      track("outbound_click", {
        href,
        label: (anchor.textContent ?? "").trim()
      });
    }
  } catch {
    // Ignore malformed URLs.
  }
});

const scrollDepths = [25, 50, 75, 100];
const depthsReached = new Set<number>();
let scrollTicking = false;

function measureScrollDepth(): void {
  if (scrollTicking) return;
  scrollTicking = true;
  window.requestAnimationFrame(() => {
    scrollTicking = false;
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const percent = scrollable <= 0 ? 100 : Math.round((window.scrollY / scrollable) * 100);
    for (const depth of scrollDepths) {
      if (percent < depth || depthsReached.has(depth)) continue;
      depthsReached.add(depth);
      track("scroll_depth", { percent: depth });
    }
  });
}

window.addEventListener("scroll", measureScrollDepth, { passive: true });
measureScrollDepth();

// ─────────────────────────────────────────────────────────────
// Restrained reveal (skipped for reduced motion)
// ─────────────────────────────────────────────────────────────

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const revealElements = [...document.querySelectorAll<HTMLElement>("[data-reveal]")];

if (!reducedMotion && "IntersectionObserver" in window && revealElements.length > 0) {
  document.body.classList.add("reveal-ready");
  const revealObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("is-in");
      revealObserver.unobserve(entry.target);
    }
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
  for (const element of revealElements) revealObserver.observe(element);
}
