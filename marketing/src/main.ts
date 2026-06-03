import "./styles.css";

// ─────────────────────────────────────────────────────────────
// Example loading policy
// ─────────────────────────────────────────────────────────────
// Marketing pages should feel instant. Only the hero route boots immediately.
// Lower examples show lightweight posters first; feature demos lazy-load near
// the viewport; heavy gallery tiles stay static and open as full examples.

const APP_BASE = (window as unknown as { APP_BASE?: string }).APP_BASE
  ?? window.location.origin;

function exampleUrl(iframe: HTMLIFrameElement): string | null {
  const route = iframe.dataset.route;
  if (!route) return null;
  const chrome = iframe.dataset.chrome ?? "hidden";
  const hash = iframe.dataset.hash;
  const sep = route.includes("?") ? "&" : "?";
  const hashPart = hash ? `#${hash}` : "";
  return `${APP_BASE}${route}${sep}chrome=${chrome}${hashPart}`;
}

function loadExample(iframe: HTMLIFrameElement): void {
  if (iframe.src) return;
  const url = exampleUrl(iframe);
  if (!url) return;
  iframe.src = url;
  iframe.dataset.loaded = "true";
}

function openExample(iframe: HTMLIFrameElement): void {
  const url = exampleUrl(iframe);
  if (!url) return;
  window.open(url, "_blank", "noopener,noreferrer");
}

function posterTitle(iframe: HTMLIFrameElement): string {
  return iframe.title
    .replace(/^Aura3D\s*·\s*/i, "")
    .replace(/\s*·\s*/g, " ")
    .trim() || "Live Aura3D example";
}

function attachPoster(iframe: HTMLIFrameElement, mode: "lazy" | "static"): void {
  const host = iframe.parentElement;
  if (!host || host.querySelector(":scope > .example-poster")) return;

  host.classList.add("example-host");
  iframe.classList.add("example-frame");
  if (mode === "static") iframe.classList.add("example-frame-static");

  const poster = document.createElement("div");
  poster.className = `example-poster example-poster-${mode}`;
  poster.innerHTML = `
    <div class="example-poster-orb" aria-hidden="true"></div>
    <div class="example-poster-grid" aria-hidden="true"></div>
    <div class="example-poster-copy">
      <span class="example-poster-kicker">${mode === "static" ? "preview" : "lazy live demo"}</span>
      <strong>${posterTitle(iframe)}</strong>
      <span>${mode === "static" ? "Open the full route when you want the live 3D app." : "Poster first. The live scene starts when this panel is near the viewport."}</span>
    </div>
    <button class="example-poster-action" type="button">Open live example</button>
  `;

  const action = poster.querySelector<HTMLButtonElement>(".example-poster-action");
  action?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openExample(iframe);
  });

  host.appendChild(poster);
}

const exampleFrames = [...document.querySelectorAll<HTMLIFrameElement>("iframe[data-route]")];

for (const iframe of exampleFrames) {
  const isHero = iframe.classList.contains("hero-canvas");
  const isStaticPreview = iframe.classList.contains("tile-canvas") || iframe.dataset.preview === "static";

  if (isHero) {
    loadExample(iframe);
    continue;
  }

  attachPoster(iframe, isStaticPreview ? "static" : "lazy");
}

const loadObserver = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    const iframe = entry.target as HTMLIFrameElement;
    loadExample(iframe);
    loadObserver.unobserve(iframe);
  }
}, { rootMargin: "180px 0px", threshold: 0.01 });

for (const iframe of exampleFrames) {
  const isHero = iframe.classList.contains("hero-canvas");
  const isStaticPreview = iframe.classList.contains("tile-canvas") || iframe.dataset.preview === "static";
  if (!isHero && !isStaticPreview) loadObserver.observe(iframe);
}

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

// ─────────────────────────────────────────────────────────────
// Clickable live example tiles
// ─────────────────────────────────────────────────────────────

document.querySelectorAll<HTMLElement>("[data-link]").forEach((tile) => {
  const href = tile.dataset.link;
  if (!href) return;
  tile.addEventListener("click", () => {
    window.location.href = href;
  });
  tile.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    window.location.href = href;
  });
});
