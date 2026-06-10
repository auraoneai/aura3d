/* Multi-track Timeline — Shots / Dialogue / Camera / FX, playhead, zoom. */
import { useRef, useState } from "react";
import { Icon } from "./Icon";
import { fmt } from "../state/util";
import type { EpisodeDocument } from "../state/types";

interface ClipModel {
  id: string;
  start: number;
  dur: number;
  label: string;
  accent: string;
}

interface TrackModel {
  name: string;
  icon: string;
  dot: string;
  rows: ClipModel[];
}

function Clip({
  clip,
  DUR,
  sel,
  onClick,
  trackRef,
  zoom,
  onRetime
}: {
  clip: ClipModel;
  DUR: number;
  sel: boolean;
  onClick: (e: React.MouseEvent) => void;
  trackRef: React.RefObject<HTMLDivElement>;
  zoom: number;
  onRetime?: (clipId: string, newDuration: number) => void;
}) {
  const left = (clip.start / DUR) * 100;
  const width = (clip.dur / DUR) * 100;

  const handleDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onRetime || !trackRef.current) return;
    const initialDur = clip.dur;
    const startX = e.clientX;
    const trackWidth = trackRef.current.getBoundingClientRect().width;
    const pxPerSecond = (trackWidth * zoom) / DUR;

    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      const newDur = Math.max(1, initialDur + delta / pxPerSecond);
      onRetime(clip.id, newDur);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div
      className={"clip" + (sel ? " sel" : "")}
      onClick={onClick}
      style={{
        left: left + "%",
        width: "calc(" + width + "% - 3px)",
        background: "linear-gradient(180deg," + clip.accent + "d9," + clip.accent + "a6)"
      }}
    >
      <span className="clab">{clip.label}</span>
      {onRetime && (
        <div
          onMouseDown={handleDown}
          title="Drag to retime"
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            bottom: 0,
            width: 6,
            cursor: "e-resize",
            zIndex: 2
          }}
        />
      )}
    </div>
  );
}

export interface TimelineProps {
  data: EpisodeDocument;
  time: number;
  onScrub: (t: number) => void;
  selShot: string | null;
  onSelShot: (id: string) => void;
  onRetime?: (clipId: string, newDuration: number) => void;
}

export function Timeline({ data, time, onScrub, selShot, onSelShot, onRetime }: TimelineProps) {
  const DUR = data.DUR;
  const [zoom, setZoom] = useState(1);
  const ref = useRef<HTMLDivElement>(null);

  const ticks: number[] = [];
  for (let t = 0; t <= DUR; t += 10) ticks.push(t);

  const scrubAt = (clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - r.left + el.scrollLeft) / (r.width * zoom)));
    onScrub(pct * DUR);
  };
  const onDown = (e: React.MouseEvent) => {
    scrubAt(e.clientX);
    const mv = (ev: MouseEvent) => scrubAt(ev.clientX);
    const up = () => {
      window.removeEventListener("mousemove", mv);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", mv);
    window.addEventListener("mouseup", up);
  };

  const charColor = (who: string) => data.cast.find((c) => c.id === who)?.color || "#6b6bff";

  const tracks: TrackModel[] = [
    {
      name: "Shots",
      icon: "film",
      dot: "#6b6bff",
      rows: data.shots.map((s) => ({ id: s.id, start: s.start, dur: s.dur, label: s.name, accent: s.color }))
    },
    {
      name: "Dialogue",
      icon: "mic",
      dot: "#ff8a5b",
      rows: data.beats.map((b) => {
        const name = data.cast.find((c) => c.id === b.who)?.name || "?";
        const label = name + " · " + (b.text.length > 22 ? b.text.slice(0, 22) + "…" : b.text);
        return { id: b.id, start: b.start, dur: b.dur, label, accent: charColor(b.who) };
      })
    },
    {
      name: "Gestures",
      icon: "sparkles",
      dot: "#9a7bff",
      rows: data.gestures.map((g) => ({ id: g.id, start: g.start, dur: g.dur, label: g.text, accent: g.color }))
    },
    {
      name: "Camera",
      icon: "camera",
      dot: "#2dd4a7",
      rows: data.camera.map((c) => ({ id: c.id, start: c.start, dur: c.dur, label: c.text, accent: c.color }))
    },
    {
      name: "FX",
      icon: "zap",
      dot: "#ff6f4d",
      rows: data.fx.map((fxc) => ({ id: fxc.id, start: fxc.start, dur: fxc.dur, label: fxc.text, accent: fxc.color }))
    }
  ];

  return (
    <section className="panel tl">
      <div className="tl-h">
        <Icon name="layers" size={15} style={{ color: "var(--tx-dim)" }} />
        <span className="ttl">Timeline</span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--tx-hi)", marginLeft: 2 }}>{fmt(time)}</span>
        <div className="tl-zoom">
          <button className="hicon" onClick={() => setZoom(Math.max(1, zoom - 0.5))} title="Zoom out">
            <Icon name="expand" size={14} />
          </button>
          <span style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--tx-faint)", minWidth: 30, textAlign: "center" }}>
            {zoom.toFixed(1) + "×"}
          </span>
          <button className="hicon" onClick={() => setZoom(Math.min(4, zoom + 0.5))} title="Zoom in">
            <Icon name="plus" size={14} />
          </button>
        </div>
      </div>
      <div className="tl-body">
        <div className="tl-labels">
          <div className="tl-lab ruler">time</div>
          {tracks.map((t) => (
            <div key={t.name} className="tl-lab">
              <span className="dot" style={{ background: t.dot }} />
              {t.name}
            </div>
          ))}
        </div>
        <div className="tl-tracks" ref={ref} onMouseDown={onDown}>
          <div className="tl-inner" style={{ width: zoom * 100 + "%" }}>
            <div className="tl-ruler">
              {ticks.map((t) => (
                <div key={t} className="tl-tick" style={{ left: (t / DUR) * 100 + "%" }}>
                  <span>{fmt(t)}</span>
                </div>
              ))}
            </div>
            {tracks.map((t) => (
              <div key={t.name} className="tl-row">
                {t.rows.map((r) => (
                  <Clip
                    key={r.id}
                    clip={r}
                    DUR={DUR}
                    sel={t.name === "Shots" && selShot === r.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onScrub(r.start);
                      if (t.name === "Shots") onSelShot(r.id);
                    }}
                    trackRef={ref}
                    zoom={zoom}
                    onRetime={t.name === "Shots" ? onRetime : undefined}
                  />
                ))}
              </div>
            ))}
            <div className="tl-playhead" style={{ left: (time / DUR) * 100 + "%" }} />
          </div>
        </div>
      </div>
    </section>
  );
}
