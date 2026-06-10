/* Stage viewport — render preview, HUD, title-safe guides, transport. */
import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { cap, fmt } from "../state/util";
import type { EpisodeDocument, Shot, ViewMode } from "../state/types";

function RenderOverlay({ pct }: { pct: number }) {
  const r = 32;
  const c = 2 * Math.PI * r;
  const indeterminate = pct < 0;
  return (
    <div className="render-ov">
      <div className="render-ring">
        <svg width={74} height={74}>
          <circle cx={37} cy={37} r={r} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth={5} />
          <circle
            cx={37}
            cy={37}
            r={r}
            fill="none"
            stroke="var(--warm)"
            strokeWidth={5}
            strokeLinecap="round"
            strokeDasharray={indeterminate ? `${c * 0.25} ${c * 0.75}` : c}
            strokeDashoffset={indeterminate ? undefined : c * (1 - pct / 100)}
            style={
              indeterminate
                ? { animation: "sp 1.2s linear infinite", transformOrigin: "37px 37px" }
                : { transition: "stroke-dashoffset .25s" }
            }
          />
        </svg>
        <div className="render-pct">{indeterminate ? "···" : Math.round(pct) + "%"}</div>
      </div>
      <div style={{ textAlign: "center" }}>
        <div className="ttl">Rendering preview</div>
        <div className="sub">
          {indeterminate ? "aura · working…" : pct < 40 ? "aura · rigging cast…" : pct < 75 ? "aura · simulating lighting…" : "aura · compositing frames…"}
        </div>
      </div>
    </div>
  );
}

export interface StageProps {
  data: EpisodeDocument;
  shot: Shot | null;
  time: number;
  playing: boolean;
  onPlay: () => void;
  onScrub: (t: number) => void;
  onStep: (dir: number) => void;
  viewMode: ViewMode;
  rendering: boolean;
  renderPct: number;
  /** Most recent REAL render output (served under /preview/*), or null before first render. */
  renderVideo?: string | null;
  renderPoster?: string | null;
  /** No real working document exists yet — render the empty "describe a scene" state. */
  empty?: boolean;
}

export function Stage({ data, shot, time, playing, onPlay, onScrub, onStep, viewMode, rendering, renderPct, renderVideo, renderPoster, empty }: StageProps) {
  const [guides, setGuides] = useState(false);
  const [cc, setCc] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const stageRef = useRef<HTMLElement>(null);
  const DUR = data.DUR;

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement === stageRef.current) {
      void document.exitFullscreen();
    } else {
      void stageRef.current?.requestFullscreen();
    }
  };

  // Drive the actual <video> element from the transport so the Play button really plays/pauses the
  // rendered clip (it previously only toggled a separate clock, so the video would start/stop on its
  // own). The video's own playback advances the clock (onTimeUpdate below), so the playhead +
  // caption follow it; scrubbing / shot-selection seeks the element.
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !renderVideo) return;
    if (playing) void v.play().catch(() => undefined);
    else v.pause();
  }, [playing, renderVideo]);
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !renderVideo) return;
    // Seek on an EXTERNAL clock move (scrub, shot select); ignore the tiny drift of normal playback.
    if (Math.abs(v.currentTime - time) > 0.4) v.currentTime = time;
  }, [time, renderVideo]);
  const beat = data.beats.find((b) => time >= b.start && time < b.start + b.dur);
  const speaker = beat && data.cast.find((c) => c.id === beat.who);
  const beatPct = beat ? Math.max(0, Math.min(1, (time - beat.start) / beat.dur)) : 0;

  const scrubAt = (clientX: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    onScrub(pct * DUR);
  };
  const onDown = (e: React.MouseEvent) => {
    const el = e.currentTarget as HTMLElement;
    scrubAt(e.clientX, el);
    const mv = (ev: MouseEvent) => scrubAt(ev.clientX, el);
    const up = () => {
      window.removeEventListener("mousemove", mv);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", mv);
    window.addEventListener("mouseup", up);
  };

  const filter =
    viewMode === "Wireframe"
      ? "grayscale(1) contrast(2.4) brightness(1.15) invert(1) sepia(1) hue-rotate(170deg) saturate(3)"
      : "none";

  // No working document yet → the production empty state (no baked stage image).
  if (empty || !shot) {
    return (
      <section className="panel stage">
        <div className="stage-canvas">
          <div className="stage-env" />
          <div className="region-wrap">
            <div className="render-region">
              <div className="stage-frame" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div className="stage-empty">
                  <Icon name="film" size={30} style={{ color: "var(--tx-faint)", opacity: 0.7 }} />
                  <div className="ttl">No render yet</div>
                  <div className="sub">
                    Describe a scene in the Director Console, or run <code>new --prompt</code>.
                  </div>
                </div>
              </div>
              <div className="stage-vig" />
              <div className="stage-grain" />
              <span className="tick tl" />
              <span className="tick tr" />
              <span className="tick bl" />
              <span className="tick br" />
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (viewMode === "Storyboard") {
    return (
      <section className="panel stage">
        <div
          className="stage-canvas"
          style={{
            padding: 18,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gridAutoRows: "1fr",
            gap: 12,
            alignItems: "stretch",
            justifyItems: "stretch",
            background: "#070810"
          }}
        >
          {data.shots.map((s, i) => (
            <div
              key={s.id}
              style={{
                position: "relative",
                borderRadius: 10,
                overflow: "hidden",
                background: "url(" + s.frame + ") center/cover",
                border: shot.id === s.id ? "2px solid var(--acc)" : "1px solid var(--line-2)"
              }}
            >
              <div style={{ position: "absolute", inset: 0, boxShadow: "inset 0 0 60px rgba(0,0,0,.5)" }} />
              <div className="hud-chip" style={{ position: "absolute", left: 10, top: 10 }}>
                <span className="k">{"SHOT " + (i + 1)}</span>
                <span className="v">{s.name}</span>
              </div>
              <div className="hud-chip" style={{ position: "absolute", right: 10, bottom: 10, fontSize: 9.5 }}>
                {s.cam}
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="panel stage" ref={stageRef}>
      <div className="stage-canvas">
        <div className="stage-env" />
        {/* HUD top-left */}
        <div className="hud tl">
          <div className="hud-chip">
            <span className="live">
              <span className="d" />
              LIVE
            </span>
            <span className="k">·</span>
            <span className="v">low-fi preview</span>
          </div>
          <div className="hud-chip">
            <span className="k">SHOT</span>
            <span className="v">{data.shots.indexOf(shot) + 1 + " / " + data.shots.length}</span>
            <span className="k">{shot.name}</span>
          </div>
        </div>
        {/* HUD top-right */}
        <div className="hud tr">
          <div className="hud-chip">
            <Icon name="camera" size={12} />
            <span className="v">{shot.cam}</span>
          </div>
          <div className="hud-chip">
            <span className="k">1920×1080</span>
            <span className="v">24fps</span>
          </div>
          <div style={{ display: "flex", gap: 7 }}>
            <button className="hud-chip" onClick={() => setGuides(!guides)} style={{ color: guides ? "var(--acc)" : "var(--tx)" }}>
              <Icon name="frame" size={12} />
              Guides
            </button>
            <button
              className="hud-chip"
              onClick={toggleFullscreen}
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              style={{ color: isFullscreen ? "var(--acc)" : "var(--tx)" }}
            >
              <Icon name="expand" size={12} />
            </button>
          </div>
        </div>
        {/* centered render region */}
        <div className="region-wrap">
          <div className="render-region">
            {viewMode === "Render" && renderVideo ? (
              // The REAL rendered preview (webm) from the render pipeline, loaded in place of
              // the static frame. Same slot/styling as `stage-frame` so the design is unchanged.
              <video
                ref={videoRef}
                className="stage-frame"
                key={renderVideo}
                src={renderVideo}
                poster={renderPoster ?? shot.frame ?? undefined}
                style={{ filter, objectFit: "cover", width: "100%", height: "100%" }}
                muted
                playsInline
                onTimeUpdate={() => {
                  const v = videoRef.current;
                  if (v && playing) onScrub(v.currentTime);
                }}
                onEnded={() => {
                  if (playing) onPlay(); // stop at the end (onPlay toggles play→pause)
                }}
              />
            ) : shot.frame ? (
              <div className="stage-frame" key={shot.id} style={{ backgroundImage: "url(" + shot.frame + ")", filter }} />
            ) : (
              // Document exists but this shot has no rendered frame yet — keep the contained
              // 16:9 frame (ticks/vignette/grain) and surface the no-render message inside it.
              <div className="stage-frame" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div className="stage-empty">
                  <Icon name="film" size={30} style={{ color: "var(--tx-faint)", opacity: 0.7 }} />
                  <div className="ttl">No render yet</div>
                  <div className="sub">
                    Hit <b>Render</b> to preview this shot, or run <code>new --prompt</code>.
                  </div>
                </div>
              </div>
            )}
            <div className="stage-vig" />
            <div className="stage-grain" />
            {guides && (
              <div className="guides">
                <div className="safe action" />
                <div className="safe title" />
                <div className="cross" />
              </div>
            )}
            <span className="tick tl" />
            <span className="tick tr" />
            <span className="tick bl" />
            <span className="tick br" />
          </div>
        </div>
        {/* The system caption sits BELOW the video frame so it never overlaps the captions already
            burned into the rendered clip. It still shows the live speaker + beat progress. */}
        {cc && beat && speaker && (
          <div className="caption caption-below" key={beat.id}>
            <span className="who" style={{ background: speaker.color }}>
              {speaker.name}
            </span>
            <span className="ctext">{cap(beat.text)}</span>
            <span className="bar">
              <i style={{ width: beatPct * 100 + "%", background: speaker.color }} />
            </span>
          </div>
        )}
        {rendering && <RenderOverlay pct={renderPct} />}
        {/* transport */}
        <div className="transport">
          <button className="tp-btn" onClick={() => onStep(-1)} title="Prev shot">
            <Icon name="prev" size={16} />
          </button>
          <button className="tp-btn tp-play" onClick={onPlay}>
            <Icon name={playing ? "pause" : "play"} size={16} />
          </button>
          <button className="tp-btn" onClick={() => onStep(1)} title="Next shot">
            <Icon name="next" size={16} />
          </button>
          <div className="tp-time">
            <b>{fmt(time)}</b>
            <span className="sl">{" / " + fmt(DUR)}</span>
          </div>
          <div className="scrub" onMouseDown={onDown}>
            <div className="scrub-rail">
              <div className="scrub-fill" style={{ width: (time / DUR) * 100 + "%" }} />
              <div className="scrub-marks">
                {data.shots.map((s) => (
                  <div key={s.id} className="scrub-mark" style={{ left: (s.start / DUR) * 100 + "%", background: s.color }} />
                ))}
              </div>
              <div className="scrub-head" style={{ left: (time / DUR) * 100 + "%" }} />
            </div>
          </div>
          <button className={"tp-pill" + (cc ? " on" : "")} onClick={() => setCc(!cc)} title="Captions">
            CC
          </button>
        </div>
      </div>
    </section>
  );
}
