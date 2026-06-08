/**
 * App shell — global state, playback clock, render queue, composition (PRD §7.2.1).
 *
 * Global state = the working EpisodeDocument (local model). Selection model is
 * `{type,id}`; the playback clock persists the scrub time to localStorage.
 * Keyboard: Space = play/pause, ⌘K = command palette.
 *
 * Render + Console actions are wired to the REAL backend via the dev-server
 * middleware (see `vite.config.ts`): `doRender` -> POST /api/render (the render
 * pipeline), Console Command mode -> POST /api/scene (the agent-native Scene-Tool
 * CLI: validated mutation commits / rejections). This is the dev-only local studio
 * control surface; the user's coding agent remains the director.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchDocument, fetchHistory, fetchExistingRender, runRender } from "./state/backend";
import { documentExists, mapDocument, mapHistory, type RuntimeDocument } from "./state/mapDocument";
import { Topbar } from "./components/Topbar";
import { Outliner } from "./components/Outliner";
import { Inspector } from "./components/Inspector";
import { Stage } from "./components/Stage";
import { Timeline } from "./components/Timeline";
import { Console, type ConsoleApi } from "./components/Console";
import { Palette } from "./components/Palette";
import { Icon } from "./components/Icon";
import { fmt } from "./state/util";
import type { EpisodeDocument, Selection, SelectionType, Toast, Turn, ViewMode } from "./state/types";

/** Empty view model — used until the real document is fetched, and when none exists. */
const EMPTY_DOC: EpisodeDocument = {
  title: "Untitled scene",
  cast: [],
  sets: [],
  props: [],
  shots: [],
  beats: [],
  camera: [],
  gestures: [],
  fx: [],
  DUR: 0,
  // M7 — an empty scene has no graded cast → previz floor.
  fidelity: { grade: "C", previz: true, characters: [], reason: "previz: no characters in the scene" }
};

/** The view-model collection a selection type indexes into. */
function selKey(t: SelectionType): "shots" | "cast" | "sets" | "props" {
  return t === "shot" ? "shots" : t === "cast" ? "cast" : t === "set" ? "sets" : "props";
}

export function App() {
  // The single source of truth is the REAL working document, fetched on mount and
  // re-fetched after every validated mutation / render so the UI stays in sync.
  const [data, setData] = useState<EpisodeDocument>(EMPTY_DOC);
  const [docExists, setDocExists] = useState(false);
  const [sel, setSel] = useState<Selection | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [time, setTime] = useState<number>(() => {
    const s = parseFloat(localStorage.getItem("aura.time") || "");
    return isNaN(s) ? 0 : s;
  });
  const [playing, setPlaying] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("Render");
  const [transcript, setTranscript] = useState<Turn[]>([]);
  const [rendering, setRendering] = useState(false);
  const [renderPct, setRenderPct] = useState(0);
  // The most recent REAL render output (served under /preview/*) loaded into the Stage.
  const [renderVideo, setRenderVideo] = useState<string | null>(null);
  const [renderPoster, setRenderPoster] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const consoleApi = useRef<ConsoleApi>({});
  const raf = useRef(0);

  const DUR = data.DUR;
  const hasShots = data.shots.length > 0;
  const currentShot = hasShots
    ? data.shots.find((s) => time >= s.start && time < s.start + s.dur) || data.shots[data.shots.length - 1]
    : null;

  // Hydrate the UI from the REAL working document (and command history). Called on mount and
  // after each /api/scene or /api/render so the panels reflect the live document.
  const hydrate = useCallback(async () => {
    const [doc, hist, render] = await Promise.all([fetchDocument(), fetchHistory(), fetchExistingRender()]);
    const exists = documentExists(doc as RuntimeDocument & { exists?: boolean });
    setDocExists(exists);
    setTranscript(mapHistory(hist));
    // Show an already-rendered video on the Stage immediately (no need to hit Render first).
    if (render.video) {
      const bust = `?t=${Date.now()}`;
      setRenderVideo(render.video + bust);
      if (render.poster) setRenderPoster(render.poster + bust);
    }
    if (!exists) {
      setData(EMPTY_DOC);
      setSel(null);
      return;
    }
    const mapped = mapDocument(doc as RuntimeDocument);
    setData(mapped);
    setSel((prev) => {
      if (prev && mapped[selKey(prev.type)].some((e: { id: string }) => e.id === prev.id)) return prev;
      return mapped.shots[0] ? { type: "shot", id: mapped.shots[0].id } : null;
    });
  }, []);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    localStorage.setItem("aura.time", time.toFixed(2));
  }, [time]);

  // playback loop. When a rendered VIDEO is on the Stage, the <video> element is the clock
  // (its onTimeUpdate drives `time`), so this rAF clock is disabled to avoid two clocks fighting
  // (which caused the sporadic start/stop). It still runs in frame/no-video mode.
  useEffect(() => {
    if (!playing || DUR <= 0 || renderVideo) return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setTime((t) => {
        const nt = t + dt;
        if (nt >= DUR) {
          setPlaying(false);
          return DUR;
        }
        return nt;
      });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, DUR, renderVideo]);

  // keyboard: Space toggles play, ⌘K toggles palette
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      const tag = (document.activeElement && document.activeElement.tagName) || "";
      if (e.code === "Space" && tag !== "TEXTAREA" && tag !== "INPUT") {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const showToast = (msg: string, kind: Toast["kind"]) => {
    setToast({ msg, kind });
    window.setTimeout(() => setToast(null), 2600);
  };

  const selectShot = (id: string) => {
    const s = data.shots.find((x) => x.id === id);
    if (s) {
      setTime(s.start + 0.2);
      setSel({ type: "shot", id });
    }
  };
  const onSelect = (type: SelectionType, id: string) => {
    if (type === "shot") selectShot(id);
    else setSel({ type, id });
  };
  const stepShot = (dir: number) => {
    if (!currentShot) return;
    const i = data.shots.indexOf(currentShot);
    const ni = Math.max(0, Math.min(data.shots.length - 1, i + dir));
    const next = data.shots[ni];
    if (next) selectShot(next.id);
  };
  const toggleVis = (id: string) =>
    setHidden((h) => {
      const n = new Set(h);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  // Outliner Cast "+" — run a REAL `cast add` command through the same path the Console
  // uses (forceCommand bypasses Prompt mode), so it actually mutates the working document,
  // appends a committed/rejected card, and re-hydrates. A unique default name avoids
  // colliding with existing cast (the user renames via the Inspector / a follow-up command).
  const addCast = () => {
    const run = consoleApi.current.run;
    if (!run) {
      showToast("Console not ready — try again", "tip");
      return;
    }
    const taken = new Set(data.cast.map((c) => c.name.toLowerCase()));
    let n = data.cast.length + 1;
    let name = `Cast ${n}`;
    while (taken.has(name.toLowerCase())) name = `Cast ${++n}`;
    run(`cast add ${name}`, true);
  };

  // Render hits the REAL pipeline via POST /api/render (dev middleware -> render-live /
  // warm render server). Progress easing runs while the request is in flight (renders are
  // not streamed); on success the rendered webm/poster is loaded into the Stage and a
  // render card is appended. Low-fi is the default for the fast studio iteration loop.
  const doRender = (scope: "shot" | "sequence") => {
    if (rendering) return;
    const isShot = scope === "shot";
    if (isShot && !currentShot) return;
    setRendering(true);
    setRenderPct(0);
    setPlaying(false);
    // Ease the progress ring toward ~92% while we await the real render; snap to 100% on done.
    const started = performance.now();
    let live = true;
    const ease = () => {
      if (!live) return;
      const t = (performance.now() - started) / 1000;
      // Asymptotic approach so the ring never claims completion before the server returns.
      setRenderPct(Math.min(92, 92 * (1 - Math.exp(-t / 9))));
      requestAnimationFrame(ease);
    };
    requestAnimationFrame(ease);

    // Render the current shot's time-range when scope is "shot", else the whole sequence.
    const range = isShot && currentShot ? `${Math.floor(currentShot.start)}-${Math.ceil(currentShot.start + currentShot.dur)}` : undefined;
    void runRender({ lowFi: true, range }).then((res) => {
      live = false;
      setRenderPct(100);
      setRendering(false);
      if (!res.ok) {
        showToast("Render failed — see console", "tip");
        return;
      }
      // Cache-bust so the Stage reloads the freshly rendered media.
      const bust = "?t=" + Date.now();
      if (res.video) setRenderVideo(res.video + bust);
      if (res.poster) setRenderPoster(res.poster + bust);
      setTranscript((tr) => [
        ...tr,
        {
          type: "render",
          id: "r" + Date.now(),
          frame: res.poster ? res.poster + bust : "",
          label: "low-fi preview · " + (isShot && currentShot ? fmt(currentShot.dur) : fmt(DUR)),
          shot: isShot && currentShot ? currentShot.name : "Full sequence",
          meta: res.ms ? "rendered in " + (res.ms / 1000).toFixed(1) + "s" : "just now"
        }
      ]);
      showToast(
        isShot && currentShot ? "Shot render complete · " + currentShot.name : "Render complete · full sequence",
        "ok"
      );
      // Re-sync the panels with the real document (shot frames may now exist).
      void hydrate();
    });
  };

  return (
    <div className="app">
      <Topbar
        scene={data.title}
        onRender={() => doRender("sequence")}
        rendering={rendering}
        viewMode={viewMode}
        setViewMode={setViewMode}
        // Honest save status: while a render is in flight the working document is being
        // committed/processed (not idle); it's "saved" only when no render is running.
        saved={!rendering}
      />
      <div className="body">
        <div className="col split">
          <Outliner
            data={data}
            sel={sel}
            onSelect={onSelect}
            hidden={hidden}
            onToggle={toggleVis}
            onOpenPalette={() => setPaletteOpen(true)}
            onAddCast={addCast}
          />
          <Inspector data={data} sel={sel} />
        </div>
        <div className="col center">
          <Stage
            data={data}
            shot={currentShot}
            time={time}
            playing={playing}
            onPlay={() => setPlaying((p) => !p)}
            onScrub={setTime}
            onStep={stepShot}
            viewMode={viewMode}
            rendering={rendering}
            renderPct={renderPct}
            renderVideo={renderVideo}
            renderPoster={renderPoster}
            empty={!docExists}
          />
          <Timeline data={data} time={time} onScrub={setTime} selShot={currentShot?.id ?? null} onSelShot={selectShot} />
        </div>
        <div className="col">
          <Console
            transcript={transcript}
            setTranscript={setTranscript}
            selShot={currentShot?.id ?? null}
            onRender={doRender}
            onSceneCommit={hydrate}
            api={consoleApi}
          />
        </div>
      </div>

      <Palette
        open={paletteOpen}
        setOpen={setPaletteOpen}
        data={data}
        api={consoleApi}
        onJumpShot={selectShot}
        onSelectEntity={onSelect}
        onRender={doRender}
        onView={setViewMode}
      />

      {toast && (
        <div className="toast-wrap">
          <div className="toast">
            <span className="i" style={{ color: toast.kind === "ok" ? "var(--ok)" : "var(--acc)" }}>
              <Icon name={toast.kind === "ok" ? "check" : "sparkles"} size={16} />
            </span>
            {toast.msg}
          </div>
        </div>
      )}
    </div>
  );
}
