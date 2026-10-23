/**
 * `?diag=1` on any showcase port page shows the GPU diagnostics panel. The implementation lives in `@aura3d/debug`
 * (`installSafetyNet`); this module only opts the showcase pages in and adapts the port's QA hook to the panel.
 * Without the query parameter it does nothing.
 */
import { installSafetyNet, resolveQualitySwitches, type DiagnosticsAppLike } from "@aura3d/debug";

export const portDiagnostics = { enabled: false, lines: [] as string[] };

/** Reads draw calls, backend and tier from the page's `window.__AURA_<GAME>__` QA hook (ports expose no app handle). */
function hookApp(): DiagnosticsAppLike {
  return {
    diagnostics() {
      const w = window as unknown as Record<string, Record<string, unknown> | undefined>;
      const name = Object.keys(w).find((key) => /^__AURA_(?!PORT_MODULES|LIVE_APPS|ROUTE_READY|SAFETY)[A-Z0-9_]+__$/.test(key));
      const hook = name ? w[name] : undefined;
      const found: Record<string, unknown> = {};
      const walk = (value: unknown, depth: number): void => {
        if (depth > 3 || value === null || typeof value !== "object") return;
        for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
          if (/^(drawCalls|backend|fallback|fallbackReason|qualityTier|tier|triangles)$/i.test(key) && (typeof v === "number" || typeof v === "string" || typeof v === "boolean")) found[key] = v;
          else if (typeof v === "object") walk(v, depth + 1);
        }
      };
      for (const member of ["diagnostics", "diag", "info", "snapshot"]) {
        try {
          const value = hook?.[member];
          walk(typeof value === "function" ? (value as () => unknown)() : value, 0);
        } catch { /* accessor needs arguments */ }
      }
      return { backend: found.backend, drawCalls: found.drawCalls, warnings: Object.entries(found).filter(([k]) => !/^(drawCalls|backend)$/.test(k)).map(([k, v]) => `${k}=${String(v)}`) };
    }
  };
}

if (typeof window !== "undefined" && typeof document !== "undefined" && resolveQualitySwitches().diag) {
  portDiagnostics.enabled = true;
  const start = (): void => {
    installSafetyNet({ safety: { selfHeal: false, panel: true }, app: hookApp() });
  };
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });
}
