import "./styles.css";

// ─────────────────────────────────────────────────────────────
// Lazy-load each iframe when it scrolls near. Iframes use:
//   data-route   — path under the monorepo dev server (port 5181)
//   data-hash    — optional hash route, e.g. "water-lab"
//   data-chrome  — "hidden" (default) or "visible"
// ─────────────────────────────────────────────────────────────

const APP_BASE = (window as unknown as { APP_BASE?: string }).APP_BASE
  ?? "http://127.0.0.1:5181";

const loadObserver = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    const iframe = entry.target as HTMLIFrameElement;
    if (iframe.src) continue;
    const route = iframe.dataset.route;
    if (!route) continue;
    const chrome = iframe.dataset.chrome ?? "hidden";
    const hash = iframe.dataset.hash;
    const sep = route.includes("?") ? "&" : "?";
    const hashPart = hash ? `#${hash}` : "";
    iframe.src = `${APP_BASE}${route}${sep}chrome=${chrome}${hashPart}`;
    loadObserver.unobserve(iframe);
  }
}, { rootMargin: "300px 0px", threshold: 0.01 });

document
  .querySelectorAll<HTMLIFrameElement>("iframe[data-route]")
  .forEach((f) => loadObserver.observe(f));

// ─────────────────────────────────────────────────────────────
// Install command — copy to clipboard
// ─────────────────────────────────────────────────────────────

const copyBtn = document.getElementById("copyBtn");
const copyLabel = document.getElementById("copyLabel");
copyBtn?.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText("pnpm add @aura3d/engine");
    copyBtn.classList.add("copied");
    if (copyLabel) copyLabel.textContent = "Copied";
    setTimeout(() => {
      copyBtn.classList.remove("copied");
      if (copyLabel) copyLabel.textContent = "Copy";
    }, 1800);
  } catch (_err) {
    /* ignore — clipboard write may be blocked in dev */
  }
});

// ─────────────────────────────────────────────────────────────
// Split-code tabs (cosmetic — switches the active tab style)
// ─────────────────────────────────────────────────────────────

const tabs = document.querySelectorAll<HTMLSpanElement>(".split-code-tab");
tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    for (const t of tabs) t.classList.remove("active");
    tab.classList.add("active");
  });
});
