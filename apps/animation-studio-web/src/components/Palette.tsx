/* Command palette (⌘K) — jump to shots/cast, run Scene-Tool commands, switch views. */
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { Icon } from "./Icon";
import { fmt } from "../state/util";
import type { ConsoleApi } from "./Console";
import type { EpisodeDocument, SelectionType, ViewMode } from "../state/types";

interface PaletteItem {
  g: string;
  nm: string;
  ds?: string;
  ic?: string;
  av?: string;
  glyph?: string;
  tag?: string;
  mono?: boolean;
  kw?: string;
  run: () => void;
}

export interface PaletteProps {
  open: boolean;
  setOpen: (o: boolean) => void;
  data: EpisodeDocument;
  api: MutableRefObject<ConsoleApi>;
  onJumpShot: (id: string) => void;
  onSelectEntity: (type: SelectionType, id: string) => void;
  onRender: (scope: "shot" | "sequence") => void;
  onView: (m: ViewMode) => void;
}

export function Palette({ open, setOpen, data, api, onJumpShot, onSelectEntity, onRender, onView }: PaletteProps) {
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setIdx(0);
      window.setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const items = useMemo<PaletteItem[]>(() => {
    const out: PaletteItem[] = [];
    out.push({ g: "Actions", nm: "Render full sequence", ds: "Low-fi preview of all shots", ic: "play2", kw: "render export preview", run: () => onRender("sequence") });
    out.push({ g: "Actions", nm: "Render current shot", ds: "Preview just the active shot", ic: "film", kw: "render shot preview", run: () => onRender("shot") });
    (["Render", "Wireframe", "Storyboard"] as ViewMode[]).forEach((m) =>
      out.push({
        g: "Actions",
        nm: "View: " + m,
        ds: "Switch viewport mode",
        ic: m === "Render" ? "film" : m === "Wireframe" ? "cube" : "grid",
        kw: "view mode " + m,
        run: () => onView(m)
      })
    );
    data.shots.forEach((s) =>
      out.push({ g: "Go to shot", nm: s.name, ds: s.cam, ic: "film", tag: fmt(s.start), kw: "shot " + s.name + " " + s.cam, run: () => onJumpShot(s.id) })
    );
    data.cast.forEach((c) =>
      out.push({ g: "Cast", av: c.color, glyph: c.glyph, nm: c.name, ds: c.kind, kw: "cast character " + c.name, run: () => onSelectEntity("cast", c.id) })
    );
    (
      [
        ["cast add Pip", "Cast a new character"],
        ["shot retime --id shot-2 --duration 30", "Retime a shot + ripple"],
        ["cam orbit", "Set active shot camera"],
        ["fx add rim light", "Add an effect to the timeline"],
        ["set station --hdr dawn", "Re-light the active set"],
        ["shot add --after shot-2", "Block a new shot"]
      ] as Array<[string, string]>
    ).forEach(([cmd, ds]) =>
      out.push({ g: "Run command", nm: cmd, ds, mono: true, ic: "bolt", kw: "command " + cmd, run: () => api.current.run?.(cmd, true) })
    );
    return out;
  }, [data, api, onJumpShot, onRender, onSelectEntity, onView]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((it) => (it.nm + " " + (it.ds || "") + " " + (it.kw || "")).toLowerCase().includes(s));
  }, [q, items]);

  useEffect(() => {
    setIdx(0);
  }, [q]);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const on = el.querySelector(".cmdk-item.on");
    if (on) on.scrollIntoView({ block: "nearest" });
  }, [idx]);

  if (!open) return null;

  const exec = (it?: PaletteItem) => {
    if (!it) return;
    setOpen(false);
    window.setTimeout(() => it.run(), 10);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setIdx((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      exec(filtered[idx]);
    }
  };

  // group while keeping a flat index for keyboard navigation
  let flat = -1;
  let lastG: string | null = null;
  const rows: Array<{ grp?: string; key: string; it?: PaletteItem; myIdx?: number }> = [];
  filtered.forEach((it) => {
    if (it.g !== lastG) {
      rows.push({ grp: it.g, key: "g" + it.g });
      lastG = it.g;
    }
    flat++;
    rows.push({ it, myIdx: flat, key: it.g + it.nm });
  });

  return (
    <div className="cmdk-ov" onMouseDown={() => setOpen(false)}>
      <div className="cmdk" onMouseDown={(e) => e.stopPropagation()}>
        <div className="cmdk-in">
          <span className="si">
            <Icon name="search" size={18} />
          </span>
          <input
            ref={inputRef}
            value={q}
            placeholder="Search shots, cast, commands…"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
          />
          <span className="esc">ESC</span>
        </div>
        <div className="cmdk-list" ref={listRef}>
          {filtered.length === 0 ? (
            <div className="cmdk-empty">{"No matches for “" + q + "”"}</div>
          ) : (
            rows.map((r) =>
              r.grp ? (
                <div className="cmdk-grp" key={r.key}>
                  {r.grp}
                </div>
              ) : (
                <div
                  key={r.key}
                  className={"cmdk-item" + (r.myIdx === idx ? " on" : "")}
                  onMouseEnter={() => setIdx(r.myIdx!)}
                  onClick={() => exec(r.it)}
                >
                  {r.it!.av ? (
                    <div className="av" style={{ background: r.it!.av }}>
                      {r.it!.glyph}
                    </div>
                  ) : (
                    <div className="ic">
                      <Icon name={r.it!.ic || "bolt"} size={15} />
                    </div>
                  )}
                  <div className="tx">
                    <div className="nm">{r.it!.nm}</div>
                    {r.it!.ds && <div className={"ds" + (r.it!.mono ? " mono" : "")}>{r.it!.ds}</div>}
                  </div>
                  {r.it!.tag ? (
                    <span className="tag">{r.it!.tag}</span>
                  ) : (
                    <span className="ent">
                      <Icon name="send" size={14} />
                    </span>
                  )}
                </div>
              )
            )
          )}
        </div>
        <div className="cmdk-foot">
          <span>
            <span className="kk">↑↓</span>navigate
          </span>
          <span>
            <span className="kk">↵</span>run
          </span>
          <span>
            <span className="kk">⌘K</span>toggle
          </span>
        </div>
      </div>
    </div>
  );
}
