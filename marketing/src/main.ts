import "./styles.css";

// ─────────────────────────────────────────────────────────────
// Lazy-load each iframe when it scrolls near. Iframes use:
//   data-route   — path under the same monorepo dev server unless APP_BASE is set
//   data-hash    — optional hash route, e.g. "water-lab"
//   data-chrome  — "hidden" (default) or "visible"
// ─────────────────────────────────────────────────────────────

const APP_BASE = (window as unknown as { APP_BASE?: string }).APP_BASE
  ?? window.location.origin;

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
// Commands — copy to clipboard
// ─────────────────────────────────────────────────────────────

const copyBtn = document.getElementById("copyBtn");
const copyLabel = document.getElementById("copyLabel");
copyBtn?.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText("npx create-aura3d@latest my-scene --template product-viewer");
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

document.querySelectorAll<HTMLButtonElement>("[data-copy][data-copy-text]").forEach((button) => {
  const original = button.textContent ?? "Copy";
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.copyText ?? "");
      button.classList.add("copied");
      button.textContent = "Copied";
      setTimeout(() => {
        button.classList.remove("copied");
        button.textContent = original;
      }, 1600);
    } catch (_err) {
      /* ignore — clipboard write may be blocked in dev */
    }
  });
});

// ─────────────────────────────────────────────────────────────
// Docs search
// ─────────────────────────────────────────────────────────────

const docsSearchInput = document.querySelector<HTMLInputElement>("[data-docs-search-input]");
const docsSearchResults = document.querySelector<HTMLElement>("[data-docs-search-results]");
const docsSearchLinks = [...document.querySelectorAll<HTMLAnchorElement>("[data-search-terms]")];

function updateDocsSearch(query: string): void {
  const normalized = query.trim().toLowerCase();
  for (const link of docsSearchLinks) {
    const terms = `${link.textContent ?? ""} ${link.dataset.searchTerms ?? ""}`.toLowerCase();
    link.hidden = normalized.length > 0 && !terms.includes(normalized);
  }
  if (docsSearchResults) docsSearchResults.dataset.active = normalized.length > 0 ? "true" : "false";
}

docsSearchInput?.addEventListener("input", () => updateDocsSearch(docsSearchInput.value));

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
