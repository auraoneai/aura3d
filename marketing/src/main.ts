import "./styles.css";

// ─────────────────────────────────────────────────────────────
// Lazy-load each <iframe data-demo> when it scrolls near.
// The demo URL is composed against a runtime base so this site
// can ship to npm consumers later by pointing DEMO_BASE at a
// hosted demo URL instead of the local dev server.
// ─────────────────────────────────────────────────────────────

const DEMO_BASE = (window as unknown as { DEMO_BASE?: string }).DEMO_BASE
  ?? "http://127.0.0.1:5181/apps/advanced-examples-gallery/";

const loadObserver = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    const iframe = entry.target as HTMLIFrameElement;
    if (iframe.src) continue;
    // "Clean" mode strips the embedded app's overlay UI so only
    // the 3D canvas renders inside the marketing stage.
    const chrome = iframe.dataset.chrome ?? "hidden";
    // Either data-url (full URL to a standalone wow-* app) or
    // data-demo (a hash route inside the advanced gallery).
    const url = iframe.dataset.url;
    const demo = iframe.dataset.demo;
    if (url) {
      const sep = url.includes("?") ? "&" : "?";
      iframe.src = `${url}${sep}chrome=${chrome}`;
    } else if (demo) {
      iframe.src = `${DEMO_BASE}?chrome=${chrome}#${demo}`;
    } else {
      continue;
    }
    loadObserver.unobserve(iframe);
  }
}, { rootMargin: "300px 0px", threshold: 0.01 });

document.querySelectorAll<HTMLIFrameElement>("iframe[data-demo], iframe[data-url]").forEach((f) => loadObserver.observe(f));

// ─────────────────────────────────────────────────────────────
// Page chrome — nav blur, reveal-on-scroll, copy install
// ─────────────────────────────────────────────────────────────

const nav = document.getElementById("nav");
const onScroll = (): void => nav?.classList.toggle("is-scrolled", window.scrollY > 12);
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

const reveal = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) {
      e.target.classList.add("is-in");
      reveal.unobserve(e.target);
    }
  }
}, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
document.querySelectorAll(".reveal").forEach((el, i) => {
  (el as HTMLElement).style.transitionDelay = `${(i % 4) * 60}ms`;
  reveal.observe(el);
});

const copyBtn = document.getElementById("copyInstall");
const copyLabel = document.getElementById("copyLabel");
copyBtn?.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText("npm install @aura3d/engine");
    copyBtn.classList.add("is-copied");
    if (copyLabel) copyLabel.textContent = "Copied";
    setTimeout(() => {
      copyBtn.classList.remove("is-copied");
      if (copyLabel) copyLabel.textContent = "Copy";
    }, 1800);
  } catch (_err) { /* ignore */ }
});
