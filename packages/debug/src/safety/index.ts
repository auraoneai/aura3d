import { createBlackFrameWatch, DEFAULT_HEAL_LADDER, healRungName, healStage, type BlackFrameWatch, type BlackFrameWatchOptions, type HealRung, type WatchObservation } from "./blackFrame.js";
import { installDiagnosticsPanel, type DiagnosticsAppLike, type DiagnosticsPanelHandle } from "./diagnosticsPanel.js";
import { resolveQualitySwitches, type QualitySwitches } from "./switches.js";

export * from "./blackFrame.js";
export * from "./guard.js";
export * from "./frameTap.js";
export * from "./diagnosticsPanel.js";
export * from "./switches.js";

export interface SafetyNetOptions {
  /** Must be true (or an options object) for anything to run: the safety net is never on by default. */
  readonly safety: boolean | SafetySettings;
  readonly canvas?: HTMLCanvasElement;
  readonly app?: DiagnosticsAppLike;
  /** Query string to read switches from; defaults to `location.search`. */
  readonly search?: string | URLSearchParams;
}

export interface SafetySettings {
  /** Reload one rung down when the canvas stays black. Default true; `?heal=0` still wins. */
  readonly selfHeal?: boolean;
  /** Show the diagnostics panel. Default: only when the URL has `?diag=1`. */
  readonly panel?: boolean | "query";
  readonly ladder?: readonly HealRung[];
  readonly watch?: Pick<BlackFrameWatchOptions, "fastFrames" | "readProbe" | "storage" | "currentUrl" | "navigate" | "storageKey" | "log" | "isReady" | "getDrawCalls" | "now" | "isHidden" | "minBlackMs" | "blackFramesBudget" | "minFramesAfterReady" | "sampleEvery" | "samplesNeeded">;
}

export interface SafetyReport {
  readonly enabled: boolean;
  readonly stage: number;
  readonly rung: string;
  readonly escalated: boolean;
  readonly switches: QualitySwitches;
  readonly panel: boolean;
  /** What the black-frame watch has seen (frames, probe stats, skips) and why a reload happened; undefined without a watch. */
  readonly observed?: WatchObservation;
}

export interface SafetyNet {
  /** Switches in force (explicit URL parameters, then the black-frame rung's parameters). */
  readonly switches: QualitySwitches;
  /** Call after every presented frame with the running frame count. */
  sample(framesDrawn: number): void;
  /** What the safety net did; also exposed as `globalThis.__AURA_SAFETY__` while installed. */
  report(): SafetyReport;
  dispose(): void;
}

const NOOP_REPORT = (switches: QualitySwitches): SafetyReport => ({ enabled: false, stage: 0, rung: "full", escalated: false, switches, panel: false });

/**
 * Opt-in runtime safety net for real-device failures: quality URL switches, black-frame self-heal and the diagnostics panel.
 * Returns an inert handle (switches still parsed) unless `safety` is truthy. Reports through stable console codes
 * (`SAFETY_COMPAT_MODE`, `SAFETY_BLACK_FRAME`), `report()` and the panel; `AuraApp.diagnostics()` is a read-only snapshot,
 * so the safety net does not write into it.
 */
export function installSafetyNet(options: SafetyNetOptions): SafetyNet {
  const settings: SafetySettings = typeof options.safety === "object" ? options.safety : {};
  const enabled = options.safety !== false && options.safety !== undefined;
  const ladder = settings.ladder ?? DEFAULT_HEAL_LADDER;
  const stage = enabled ? healStage(settings.watch?.storage, ladder, settings.watch?.storageKey) : 0;
  const switches = resolveQualitySwitches({ search: options.search, healStage: stage, ladder });
  if (!enabled) {
    return { switches, sample() {}, report: () => NOOP_REPORT(switches), dispose() {} };
  }

  let watch: BlackFrameWatch | undefined;
  if (options.canvas && settings.selfHeal !== false) {
    watch = createBlackFrameWatch(options.canvas, { enabled: switches.heal, ladder, ...settings.watch });
  }
  const showPanel = settings.panel === true || ((settings.panel === undefined || settings.panel === "query") && switches.diag);
  const report = (): SafetyReport => ({
    enabled: true,
    stage: watch?.stage ?? stage,
    rung: watch?.rung ?? healRungName(stage, ladder),
    escalated: watch?.escalated ?? false,
    switches,
    panel: showPanel,
    ...(watch ? { observed: watch.observation() } : {})
  });
  let panel: DiagnosticsPanelHandle | undefined;
  if (showPanel && typeof document !== "undefined") {
    panel = installDiagnosticsPanel({
      ...(options.app ? { app: options.app } : {}),
      title: "Aura3D safety net (?diag=1)",
      extraLines: () => {
        const r = report();
        const off = (["post", "shadow", "env", "sky", "aa"] as const).filter((key) => !switches[key]);
        const lines = [`safety: rung ${r.stage} (${r.rung})${r.escalated ? " reloading" : ""} off:[${off.join(",")}] quality:${switches.quality} tm:${switches.toneMapping} heal:${switches.heal ? "on" : "off"}`];
        const seen = r.observed ?? (globalThis as { __AURA3D_HEAL__?: { observation?: () => WatchObservation } }).__AURA3D_HEAL__?.observation?.();
        if (seen) {
          const s = seen.lastStats;
          lines.push(`heal watch: frames ${seen.calls} ready@${seen.readyAtCall ?? "no"} samples ${seen.samples} black ${seen.blackSamples} lit ${s ? `${s.lit}/${s.samples} max ${s.max}` : "n/a"} frame ${Math.round(seen.medianFrameMs)}ms skipped notReady ${seen.skipped.notReady} noDraw ${seen.skipped.noDrawCalls}${seen.healthy ? " healthy" : ""}`);
          if (seen.reason) lines.push(`heal reason: ${seen.reason}`);
        }
        return lines;
      }
    });
  }
  const g = globalThis as { __AURA_SAFETY__?: () => SafetyReport };
  g.__AURA_SAFETY__ = report;
  return {
    switches,
    sample: (framesDrawn) => watch?.sample(framesDrawn),
    report,
    dispose() {
      panel?.dispose();
      if (g.__AURA_SAFETY__ === report) delete g.__AURA_SAFETY__;
    }
  };
}
