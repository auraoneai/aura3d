import { AnimationMixer, type AnimationEvent } from "@aura3d/animation";

export interface AnimationDebugOverlayStateRow {
  readonly name: string;
  readonly clipName: string;
  readonly weight: number;
  readonly playing: boolean;
  readonly time: number;
  readonly timeScale: number;
}

export interface AnimationDebugOverlayEventRow {
  readonly frame: number;
  readonly name: string;
  readonly clipName: string;
  readonly time: number;
}

export interface AnimationDebugOverlaySnapshot {
  readonly frame: number;
  readonly updateCount: number;
  readonly mixerTimeScale: number;
  readonly states: readonly AnimationDebugOverlayStateRow[];
  readonly weights: Readonly<Record<string, number>>;
  readonly layers: readonly { readonly name: string; readonly weight: number; readonly actions: readonly string[] }[];
  readonly events: readonly AnimationDebugOverlayEventRow[];
  readonly lastEventCount: number;
}

export interface AnimationDebugOverlayOptions {
  readonly mixer: AnimationMixer;
  readonly maxEvents?: number;
  readonly stateName?: (action: { readonly clipName: string }, index: number) => string;
}

export interface AnimationDebugOverlayMount {
  innerHTML: string;
}

export interface AnimationDebugOverlay {
  readonly mixer: AnimationMixer;
  update(delta: number): readonly AnimationEvent[];
  snapshot(): AnimationDebugOverlaySnapshot;
  toHTML(): string;
  mount(element: AnimationDebugOverlayMount): () => void;
  dispose(): void;
}

/**
 * Root safe API visual-debug overlay for game tuning: live action states,
 * per-action weights, layer weights, and fired events per frame. Drive it
 * with `update(delta)` (it advances the wrapped mixer), render with
 * `toHTML()` or `mount(element)`. Fail-loud: invalid options, deltas, and
 * mount targets throw naming this API; use after `dispose()` throws too.
 */
export function createAnimationDebugOverlay(options: AnimationDebugOverlayOptions): AnimationDebugOverlay {
  if (!options || typeof options !== "object") {
    throw new Error("createAnimationDebugOverlay: options are required.");
  }
  if (!(options.mixer instanceof AnimationMixer)) {
    throw new Error("createAnimationDebugOverlay: mixer must be an AnimationMixer created by createAnimationMixer.");
  }
  const maxEvents = options.maxEvents ?? 8;
  if (!Number.isInteger(maxEvents) || maxEvents < 0) {
    throw new Error("createAnimationDebugOverlay: maxEvents must be a non-negative integer.");
  }
  if (options.stateName !== undefined && typeof options.stateName !== "function") {
    throw new Error("createAnimationDebugOverlay: stateName must be a function.");
  }

  const mixer = options.mixer;
  const nameFor = options.stateName ?? ((action, index) => `${action.clipName}#${index}`);
  let frame = 0;
  let updateCount = 0;
  let lastEventCount = 0;
  let recentEvents: AnimationDebugOverlayEventRow[] = [];
  let mounted: AnimationDebugOverlayMount | null = null;
  let disposed = false;

  function assertAlive(api: string): void {
    if (disposed) {
      throw new Error(`${api}: overlay has been disposed.`);
    }
  }

  function buildSnapshot(): AnimationDebugOverlaySnapshot {
    const mixerSnapshot = mixer.snapshot();
    const states: AnimationDebugOverlayStateRow[] = mixerSnapshot.actions.map((action, index) => ({
      name: nameFor(action, index),
      clipName: action.clipName,
      weight: action.weight,
      playing: action.playing,
      time: action.time,
      timeScale: action.timeScale
    }));
    const weights: Record<string, number> = {};
    for (const state of states) {
      weights[state.name] = state.weight;
    }
    return {
      frame,
      updateCount,
      mixerTimeScale: mixerSnapshot.timeScale,
      states,
      weights,
      layers: mixerSnapshot.layers.map((layer) => ({
        name: layer.name,
        weight: layer.weight,
        actions: [...layer.actions]
      })),
      events: [...recentEvents],
      lastEventCount
    };
  }

  function render(snapshot: AnimationDebugOverlaySnapshot): string {
    const stateRows = snapshot.states
      .map(
        (state) =>
          `<tr data-state="${escapeHtml(state.name)}"><td>${escapeHtml(state.name)}</td>` +
          `<td>${escapeHtml(state.clipName)}</td>` +
          `<td data-weight="${state.weight.toFixed(3)}">${state.weight.toFixed(3)}</td>` +
          `<td>${state.playing ? "playing" : "stopped"}</td>` +
          `<td>${state.time.toFixed(3)}s</td></tr>`
      )
      .join("");
    const layerRows = snapshot.layers
      .map(
        (layer) =>
          `<tr data-layer="${escapeHtml(layer.name)}"><td>${escapeHtml(layer.name)}</td>` +
          `<td>${layer.weight.toFixed(3)}</td><td>${escapeHtml(layer.actions.join(", "))}</td></tr>`
      )
      .join("");
    const eventRows = snapshot.events
      .map(
        (event) =>
          `<li data-event="${escapeHtml(event.name)}">f${event.frame} ${escapeHtml(event.clipName)}:${escapeHtml(event.name)} @${event.time.toFixed(3)}s</li>`
      )
      .join("");
    return (
      `<section data-overlay="animation-debug" data-frame="${snapshot.frame}">` +
      `<h2>animation graph</h2>` +
      `<p data-timescale="${snapshot.mixerTimeScale}">timeScale ${snapshot.mixerTimeScale}</p>` +
      `<table><caption>states</caption><tbody>${stateRows}</tbody></table>` +
      `<table><caption>layers</caption><tbody>${layerRows}</tbody></table>` +
      `<ul data-events="${snapshot.lastEventCount}">${eventRows}</ul>` +
      `</section>`
    );
  }

  const overlay: AnimationDebugOverlay = {
    mixer,
    update(delta: number): readonly AnimationEvent[] {
      assertAlive("AnimationDebugOverlay.update");
      if (!Number.isFinite(delta) || delta < 0) {
        throw new Error("AnimationDebugOverlay.update: delta must be finite and non-negative.");
      }
      const events = mixer.update(delta);
      frame += 1;
      updateCount += 1;
      lastEventCount = events.length;
      if (events.length > 0 && maxEvents > 0) {
        const rows = events.map((event) => ({
          frame,
          name: event.name,
          clipName: event.clipName,
          time: event.time
        }));
        recentEvents = [...rows, ...recentEvents].slice(0, maxEvents);
      } else if (maxEvents === 0) {
        recentEvents = [];
      }
      if (mounted) {
        mounted.innerHTML = render(buildSnapshot());
      }
      return events;
    },
    snapshot(): AnimationDebugOverlaySnapshot {
      assertAlive("AnimationDebugOverlay.snapshot");
      return buildSnapshot();
    },
    toHTML(): string {
      assertAlive("AnimationDebugOverlay.toHTML");
      return render(buildSnapshot());
    },
    mount(element: AnimationDebugOverlayMount): () => void {
      assertAlive("AnimationDebugOverlay.mount");
      if (!element || typeof element !== "object" || typeof (element as { innerHTML?: unknown }).innerHTML !== "string") {
        throw new Error("AnimationDebugOverlay.mount: element must be an object accepting innerHTML.");
      }
      mounted = element;
      mounted.innerHTML = render(buildSnapshot());
      return () => {
        if (mounted === element) {
          mounted = null;
        }
      };
    },
    dispose(): void {
      mounted = null;
      recentEvents = [];
      disposed = true;
    }
  };
  return overlay;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
